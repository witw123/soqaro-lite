import type { PeerSignalMessage } from "@soqaro/shared";

export type SignalType = PeerSignalMessage["type"];
export type PeerLinkKind = "data" | "media";

type SignalDiagnosticRecorder = (payload: {
  peerId: string;
  direction: "sent" | "received";
  type: SignalType;
  linkKind?: PeerLinkKind;
}) => void;

type SignalPeerEntry = {
  connection: {
    addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
    createAnswer: () => Promise<RTCLocalSessionDescriptionInit>;
    localDescription: RTCSessionDescription | RTCSessionDescriptionInit | null;
    remoteDescription: RTCSessionDescription | RTCSessionDescriptionInit | null;
    setLocalDescription: (description?: RTCLocalSessionDescriptionInit) => Promise<void>;
    signalingState: RTCSignalingState;
  };
  pendingCandidates: RTCIceCandidateInit[];
  lastSignalProgressAtMs: number;
  connectionGeneration?: number;
};

type IncomingSignalOrder = {
  connectionGeneration: number | null;
  sequenceByType: Partial<Record<SignalType, number>>;
};

type LocalOfferConnection = {
  createOffer: (options?: RTCOfferOptions) => Promise<RTCLocalSessionDescriptionInit>;
  setLocalDescription: (description?: RTCLocalSessionDescriptionInit) => Promise<void>;
};

type IncomingSignalHandlers<TEntry extends SignalPeerEntry> = {
  getOrCreatePeerEntry: (
    peerId: string,
    linkKind?: PeerLinkKind,
    signalType?: SignalType
  ) => Promise<TEntry | null>;
  runPeerOperation: <T>(entry: TEntry, task: () => Promise<T>) => Promise<T | undefined>;
  applyRemoteDescription: (
    entry: TEntry,
    remoteDescription: RTCSessionDescriptionInit
  ) => Promise<void>;
  flushPendingCandidates: (entry: TEntry) => Promise<void>;
  nowMs?: () => number;
};

export function buildDataPeerSignal(input: {
  roomId: string;
  localPeerId: string;
  remotePeerId: string;
  type: SignalType;
  payload: Record<string, unknown>;
}): PeerSignalMessage {
  return buildPeerSignal({ ...input, linkKind: "data" });
}

export function buildMediaPeerSignal(input: {
  roomId: string;
  localPeerId: string;
  remotePeerId: string;
  type: SignalType;
  payload: Record<string, unknown>;
}): PeerSignalMessage {
  return buildPeerSignal({ ...input, linkKind: "media" });
}

function buildPeerSignal(input: {
  roomId: string;
  localPeerId: string;
  remotePeerId: string;
  type: SignalType;
  payload: Record<string, unknown>;
  linkKind: PeerLinkKind;
  connectionGeneration?: number;
}): PeerSignalMessage {
  return {
    protocolVersion: 4,
    capability: "webrtc-opus-v1",
    roomId: input.roomId,
    fromPeerId: input.localPeerId,
    toPeerId: input.remotePeerId,
    channelKind: "data",
    linkKind: input.linkKind,
    type: input.type,
    payload: input.payload,
    ...(typeof input.connectionGeneration === "number"
      ? { connectionGeneration: input.connectionGeneration }
      : {})
  };
}

// An offer/answer exchange is expected to complete within a couple of
// seconds. A remote offer that has been pending longer than this window is
// treated as wedged and rolled back when the next offer arrives.
const staleRemoteOfferRollbackMs = 5_000;

export class SignalingTransport {
  private readonly roomId: string;
  private readonly localPeerId: string;
  private readonly sendSignal: (payload: PeerSignalMessage) => void;
  private readonly onSignal?: SignalDiagnosticRecorder;
  private readonly incomingSignalOrder = new Map<string, IncomingSignalOrder>();
  private readonly latestSenderRecoveryGeneration = new Map<string, number>();
  // Ordering keys are indexed by the receiver's own recovery generation so a
  // re-subscribe (which mints a new generation) can garbage-collect every
  // bucket minted under the previous one. Without this the maps grow by
  // peers x re-subscribes for the lifetime of the transport.
  private readonly signalOrderKeysByTargetGeneration = new Map<
    number,
    { orderKeys: Set<string>; senderRecoveryKeys: Set<string> }
  >();
  private latestTargetRecoveryGeneration = 0;

  constructor(input: {
    roomId: string;
    localPeerId: string;
    sendSignal: (payload: PeerSignalMessage) => void;
    onSignal?: SignalDiagnosticRecorder;
  }) {
    this.roomId = input.roomId;
    this.localPeerId = input.localPeerId;
    this.sendSignal = input.sendSignal;
    this.onSignal = input.onSignal;
  }

  markReceived(peerId: string, type: SignalType, linkKind: PeerLinkKind = "data") {
    this.onSignal?.({
      peerId,
      direction: "received",
      type,
      linkKind
    });
  }

  send(
    peerId: string,
    type: SignalType,
    payload: Record<string, unknown>,
    linkKind: PeerLinkKind = "data",
    connectionGeneration?: number
  ) {
    this.onSignal?.({
      peerId,
      direction: "sent",
      type,
      linkKind
    });
    this.sendSignal(
      buildPeerSignal({
        roomId: this.roomId,
        localPeerId: this.localPeerId,
        remotePeerId: peerId,
        type,
        payload,
        linkKind,
        connectionGeneration
      })
    );
  }

  async createAndSendOffer(
    peerId: string,
    connection: LocalOfferConnection,
    options?: RTCOfferOptions,
    linkKind: PeerLinkKind = "data",
    connectionGeneration?: number
  ) {
    const offer = options ? await connection.createOffer(options) : await connection.createOffer();
    await connection.setLocalDescription(offer);
    this.send(peerId, "offer", toSessionDescriptionPayload(offer), linkKind, connectionGeneration);
    return offer;
  }

  async handleIncomingSignal<TEntry extends SignalPeerEntry>(
    payload: PeerSignalMessage,
    handlers: IncomingSignalHandlers<TEntry>
  ) {
    if (payload.channelKind !== "data" || payload.toPeerId !== this.localPeerId) {
      return;
    }

    const linkKind = payload.linkKind ?? "data";
    // Reject known stale/reordered signals before allocating a peer entry.
    // This is a read-only check; the ordering slot is committed only after
    // topology admission succeeds below.
    if (!this.canAcceptIncomingSignalOrder(payload)) {
      return;
    }
    const entry = await handlers.getOrCreatePeerEntry(payload.fromPeerId, linkKind, payload.type);
    // A topology update may have removed this peer (or changed the active
    // source) while its SDP/ICE was in flight. Do not let that late signal
    // recreate a connection outside the currently admitted topology.
    if (!entry) {
      return;
    }
    // Only consume the signal's ordering slot after topology admission. A
    // signal can arrive just before a late joiner's source state is known;
    // consuming it while rejecting the peer would permanently discard it.
    if (!this.acceptIncomingSignalOrder(payload)) {
      return;
    }
    if (payload.type === "offer") {
      await handlers.runPeerOperation(entry, async () => {
        this.markReceived(payload.fromPeerId, "offer", linkKind);
        const remoteDescription = toSessionDescriptionInit(payload.payload);
        if (!remoteDescription) {
          return;
        }

        if (
          entry.connection.signalingState !== "stable" &&
          entry.connection.signalingState !== "have-local-offer"
        ) {
          // A previous offer can wedge the connection in have-remote-offer
          // when createAnswer/setLocalDescription threw midway. Without a
          // rollback every later offer is dropped here and only the outer
          // watchdog can recover, so roll a stale remote offer back to stable
          // and process the fresh one.
          if (
            entry.connection.signalingState === "have-remote-offer" &&
            (handlers.nowMs ?? Date.now)() - entry.lastSignalProgressAtMs >
              staleRemoteOfferRollbackMs
          ) {
            await entry.connection.setLocalDescription({ type: "rollback" });
          } else {
            return;
          }
        }

        if (entry.connection.signalingState === "have-local-offer") {
          // The lexically larger peer is polite during renegotiation. It rolls
          // back its local media offer so a source change cannot strand the
          // connection in have-local-offer.
          if (this.localPeerId.localeCompare(payload.fromPeerId) < 0) {
            // Keep the pending local offer, but make sure the polite peer can
            // receive it again after rolling back its recovery offer.
            const localDescription = entry.connection.localDescription;
            if (localDescription?.type === "offer") {
              this.send(
                payload.fromPeerId,
                "offer",
                toSessionDescriptionPayload(localDescription),
                linkKind,
                entry.connectionGeneration
              );
            }
            return;
          }
          await entry.connection.setLocalDescription({ type: "rollback" });
        }

        await handlers.applyRemoteDescription(entry, remoteDescription);
        entry.lastSignalProgressAtMs = (handlers.nowMs ?? Date.now)();
        await handlers.flushPendingCandidates(entry);
        const answer = await entry.connection.createAnswer();
        await entry.connection.setLocalDescription(answer);
        this.send(
          payload.fromPeerId,
          "answer",
          toSessionDescriptionPayload(answer),
          linkKind,
          entry.connectionGeneration
        );
        entry.lastSignalProgressAtMs = (handlers.nowMs ?? Date.now)();
      });
      return;
    }

    if (payload.type === "answer") {
      await handlers.runPeerOperation(entry, async () => {
        this.markReceived(payload.fromPeerId, "answer", linkKind);
        const remoteDescription = toSessionDescriptionInit(payload.payload);
        if (!remoteDescription) {
          return;
        }

        if (entry.connection.signalingState !== "have-local-offer") {
          return;
        }

        await handlers.applyRemoteDescription(entry, remoteDescription);
        await handlers.flushPendingCandidates(entry);
        entry.lastSignalProgressAtMs = (handlers.nowMs ?? Date.now)();
      });
      return;
    }

    if (payload.type === "candidate") {
      await handlers.runPeerOperation(entry, async () => {
        this.markReceived(payload.fromPeerId, "candidate", linkKind);
        const candidate = toIceCandidateInit(payload.payload);
        if (!candidate) {
          return;
        }

        if (!entry.connection.remoteDescription) {
          entry.pendingCandidates.push(candidate);
          return;
        }

        try {
          await entry.connection.addIceCandidate(candidate);
          entry.lastSignalProgressAtMs = (handlers.nowMs ?? Date.now)();
        } catch {
          if (!entry.connection.remoteDescription) {
            entry.pendingCandidates.push(candidate);
          }
        }
      });
    }
  }

  private acceptIncomingSignalOrder(payload: PeerSignalMessage) {
    if (!this.canAcceptIncomingSignalOrder(payload)) {
      return false;
    }

    const {
      key,
      targetRecoveryGeneration,
      previous,
      connectionGeneration,
      sequence,
      senderRecoveryKey,
      senderRecoveryGeneration
    } =
      this.getIncomingSignalOrderState(payload);

    const generationChanged = previous !== undefined &&
      connectionGeneration !== previous.connectionGeneration;
    const sequenceByType = generationChanged
      ? {}
      : { ...(previous?.sequenceByType ?? {}) };
    if (sequence !== null) {
      sequenceByType[payload.type] = Math.max(
        sequenceByType[payload.type] ?? Number.MIN_SAFE_INTEGER,
        sequence
      );
    }
    this.incomingSignalOrder.set(key, {
      connectionGeneration:
        connectionGeneration ?? previous?.connectionGeneration ?? null,
      sequenceByType
    });
    this.pruneSignalOrderBuckets(key, senderRecoveryKey, targetRecoveryGeneration);
    if (senderRecoveryGeneration !== null) {
      const previousSenderGeneration = this.latestSenderRecoveryGeneration.get(senderRecoveryKey);
      if (previousSenderGeneration === undefined || senderRecoveryGeneration > previousSenderGeneration) {
        this.latestSenderRecoveryGeneration.set(senderRecoveryKey, senderRecoveryGeneration);
        const prefix = `${senderRecoveryKey}:`;
        for (const existingKey of this.incomingSignalOrder.keys()) {
          if (existingKey.startsWith(prefix) && existingKey !== key) {
            this.incomingSignalOrder.delete(existingKey);
          }
        }
      }
    }
    return true;
  }

  private canAcceptIncomingSignalOrder(payload: PeerSignalMessage) {
    const {
      previous,
      connectionGeneration,
      sequence,
      senderRecoveryGeneration,
      senderRecoveryKey
    } =
      this.getIncomingSignalOrderState(payload);
    if (!previous) {
      const latestSenderGeneration = this.latestSenderRecoveryGeneration.get(senderRecoveryKey);
      return senderRecoveryGeneration !== null &&
        latestSenderGeneration !== undefined
        ? senderRecoveryGeneration >= latestSenderGeneration
        : true;
    }

    const latestSenderGeneration = this.latestSenderRecoveryGeneration.get(senderRecoveryKey);
    if (latestSenderGeneration !== undefined) {
      if (senderRecoveryGeneration === null || senderRecoveryGeneration < latestSenderGeneration) {
        return false;
      }
    }

    // Once a peer has announced a connection incarnation, an untagged signal
    // cannot be safely assigned to the current RTCPeerConnection. Accepting
    // it here lets delayed candidates from an older connection contaminate a
    // newly recreated media peer.
    if (previous.connectionGeneration !== null && connectionGeneration === null) {
      return false;
    }
    if (
      connectionGeneration !== null &&
      previous.connectionGeneration !== null &&
      connectionGeneration < previous.connectionGeneration
    ) {
      return false;
    }
    if (
      connectionGeneration === previous.connectionGeneration &&
      sequence !== null &&
      typeof previous.sequenceByType[payload.type] === "number" &&
      sequence <= previous.sequenceByType[payload.type]!
    ) {
      return false;
    }
    return true;
  }

  private pruneSignalOrderBuckets(
    key: string,
    senderRecoveryKey: string,
    targetRecoveryGeneration: number
  ) {
    let bucket = this.signalOrderKeysByTargetGeneration.get(targetRecoveryGeneration);
    if (!bucket) {
      bucket = { orderKeys: new Set(), senderRecoveryKeys: new Set() };
      this.signalOrderKeysByTargetGeneration.set(targetRecoveryGeneration, bucket);
    }
    bucket.orderKeys.add(key);
    bucket.senderRecoveryKeys.add(senderRecoveryKey);

    if (targetRecoveryGeneration <= this.latestTargetRecoveryGeneration) {
      return;
    }
    this.latestTargetRecoveryGeneration = targetRecoveryGeneration;
    for (const [generation, staleBucket] of this.signalOrderKeysByTargetGeneration) {
      if (generation >= targetRecoveryGeneration) {
        continue;
      }
      for (const staleKey of staleBucket.orderKeys) {
        this.incomingSignalOrder.delete(staleKey);
      }
      for (const staleSenderKey of staleBucket.senderRecoveryKeys) {
        this.latestSenderRecoveryGeneration.delete(staleSenderKey);
      }
      this.signalOrderKeysByTargetGeneration.delete(generation);
    }
  }

  private getIncomingSignalOrderState(payload: PeerSignalMessage) {
    const linkKind = payload.linkKind ?? "data";
    const targetRecoveryGeneration = payload.recoveryGeneration ?? 0;
    const senderRecoveryGeneration = payload.senderRecoveryGeneration ?? null;
    const senderRecoveryKey = `${payload.fromPeerId}:${linkKind}:${targetRecoveryGeneration}`;
    const key = `${senderRecoveryKey}:${senderRecoveryGeneration ?? 0}`;
    return {
      key,
      targetRecoveryGeneration,
      senderRecoveryKey,
      previous: this.incomingSignalOrder.get(key),
      connectionGeneration: payload.connectionGeneration ?? null,
      sequence: payload.sequence ?? null,
      senderRecoveryGeneration
    };
  }
}

export function toSessionDescriptionPayload(
  description: RTCLocalSessionDescriptionInit
): Record<string, unknown> {
  return {
    type: description.type,
    ...(typeof description.sdp === "string" ? { sdp: description.sdp } : {})
  };
}

export function toSessionDescriptionInit(
  payload: Record<string, unknown>
): RTCSessionDescriptionInit | null {
  if (typeof payload.type !== "string") {
    return null;
  }

  return {
    type: payload.type as RTCSdpType,
    sdp: typeof payload.sdp === "string" ? payload.sdp : undefined
  };
}

export function toIceCandidateInit(
  payload: Record<string, unknown>
): RTCIceCandidateInit | null {
  if (typeof payload.candidate !== "string") {
    return null;
  }

  return {
    candidate: payload.candidate,
    sdpMid: typeof payload.sdpMid === "string" ? payload.sdpMid : undefined,
    sdpMLineIndex:
      typeof payload.sdpMLineIndex === "number" ? payload.sdpMLineIndex : undefined,
    usernameFragment:
      typeof payload.usernameFragment === "string" ? payload.usernameFragment : undefined
  };
}

export function shouldIgnoreStaleAnswerError(
  signalingState: RTCSignalingState,
  error: unknown
) {
  if (signalingState === "have-local-offer") {
    return false;
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /wrong state:\s*stable/i.test(message) || /Called in wrong state:\s*stable/i.test(message);
}
