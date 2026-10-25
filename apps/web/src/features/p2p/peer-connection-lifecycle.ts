import type { IceServerConfig } from "@soqaro/shared";
import {
  clearPeerTimers,
  type PeerEntry
} from "./peer-connection-registry";
import type { PeerLinkKind } from "./signaling-transport";

type PeerStalledReason = "watchdog-timeout" | "connection-failed" | "data-channel-closed";

const remoteTrackMuteGraceMs = 3_000;
const receiverPlayoutDelaySeconds = 0.3;
const receiverJitterBufferTargetMs = 300;

export function shouldInitiatePeerConnection(localPeerId: string, peerId: string) {
  return localPeerId.localeCompare(peerId) < 0;
}

export function buildPeerConnectionConfig(input: {
  peerId: string;
  iceServers: IceServerConfig[];
  resolveConnectionConfig?: (peerId: string) => Partial<RTCConfiguration> | null | undefined;
}): RTCConfiguration {
  return {
    iceServers: normalizeIceServers(
      input.iceServers.length > 0
        ? input.iceServers
        : [{ urls: "stun:stun.l.google.com:19302" }]
    ),
    // Candidate gathering is started on demand. A ten-member mesh creates many
    // data/media PeerConnections; pre-gathering a pool for every one consumes
    // ICE/UDP resources before any media path is active and starves later
    // connections during a source fan-out.
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 0,
    ...(input.resolveConnectionConfig?.(input.peerId) ?? {})
  };
}

function normalizeIceServers(iceServers: IceServerConfig[]): IceServerConfig[] {
  return iceServers.filter((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => url.trim().length > 0);
  });
}

export function resolveExistingPeerConnectionAction(input: {
  entry: PeerEntry;
}): "release" | "reuse" {
  if (
    input.entry.connection.connectionState === "failed" ||
    input.entry.connection.connectionState === "closed"
  ) {
    return "release";
  }

  return "reuse";
}

export function releasePeerConnectionEntry(input: {
  peerId: string;
  entry: PeerEntry;
  deleteIfCurrent: (peerId: string, entry: PeerEntry, linkKind?: "data" | "media") => boolean;
  clearPendingRequestsForPeer: (peerId: string) => void;
  stopStatsSampling: (entry: PeerEntry) => void;
  onDataBufferedAmountChange?: (payload: {
    peerId: string;
    bufferedAmountBytes: number;
  }) => void;
}) {
  input.entry.releasing = true;
  if (input.entry.linkKind === "data") {
    input.deleteIfCurrent(input.peerId, input.entry);
  } else {
    input.deleteIfCurrent(input.peerId, input.entry, input.entry.linkKind);
  }
  clearPeerTimers(input.entry);
  if (input.entry.linkKind === "data") {
    input.clearPendingRequestsForPeer(input.peerId);
  }
  input.stopStatsSampling(input.entry);
  if (input.entry.linkKind === "data") {
    input.entry.channel?.close();
  }
  input.entry.connection.close();
  input.entry.audioTransceiver = null;
  input.entry.audioSender = null;
  input.entry.audioReceiver = null;
  input.entry.remoteAudioStream = null;
  input.entry.remoteAudioTrackId = null;
  input.entry.senderStreamId = null;
  input.entry.senderTrackState = "none";
  input.entry.configuredAudioMaxBitrateKbps = null;
  input.entry.appliedAudioBitrateKbps = null;
  input.entry.receiverTrackState = "none";
  input.entry.receiverRtpActive = false;
  if (input.entry.receiverMuteTimerId) {
    clearTimeout(input.entry.receiverMuteTimerId);
    input.entry.receiverMuteTimerId = null;
  }
  if (input.entry.mediaWatchdogTimerId) {
    clearTimeout(input.entry.mediaWatchdogTimerId);
    input.entry.mediaWatchdogTimerId = null;
  }
  if (input.entry.mediaSyncRetryTimerId !== null) {
    clearTimeout(input.entry.mediaSyncRetryTimerId);
    input.entry.mediaSyncRetryTimerId = null;
  }
  input.entry.mediaSyncRetryAttempts = 0;
  input.entry.mediaNegotiationPending = false;
  input.onDataBufferedAmountChange?.({
    peerId: input.peerId,
    bufferedAmountBytes: 0
  });
}

export function bindPeerConnectionEvents(input: {
  peerId: string;
  entry: PeerEntry;
  localPeerId: string;
  connection: RTCPeerConnection;
  linkKind?: PeerLinkKind;
  autoReconnect: boolean;
  isCurrentEntry: (peerId: string, entry: PeerEntry) => boolean;
  isExpectedPeer: (peerId: string) => boolean;
  sendCandidate: (peerId: string, payload: Record<string, unknown>) => void;
  onPeerConnectionChange?: (payload: {
    peerId: string;
    state: RTCPeerConnectionState;
    linkKind?: PeerLinkKind;
  }) => void;
  onIceConnectionStateChange?: (payload: {
    peerId: string;
    state: RTCIceConnectionState;
    linkKind?: PeerLinkKind;
  }) => void;
  onPeerStalled?: (payload: {
    peerId: string;
    reason: PeerStalledReason;
  }) => void;
  schedulePeerReconnect: (peerId: string, entry: PeerEntry) => void;
  schedulePeerWatchdog: (peerId: string, entry: PeerEntry) => void;
  releasePeer: (peerId: string, entry: PeerEntry) => void;
  bindChannel: (peerId: string, entry: PeerEntry, channel: RTCDataChannel) => void;
  onRemoteAudioTrack?: (payload: {
    peerId: string;
    entry: PeerEntry;
    track: MediaStreamTrack;
    streams: readonly MediaStream[];
  }) => void;
  onMediaStateChange?: (payload: {
    peerId: string;
    entry: PeerEntry;
    direction: "sender" | "receiver";
    state: PeerEntry["senderTrackState"];
  }) => void;
  onMediaTrackMuted?: (payload: { peerId: string; trackId: string }) => void;
}) {
  input.connection.onicecandidate = (event) => {
    if (!event.candidate || !input.isCurrentEntry(input.peerId, input.entry)) {
      return;
    }
    input.entry.lastSignalProgressAtMs = Date.now();
    input.sendCandidate(
      input.peerId,
      toIceCandidatePayload(event.candidate.toJSON())
    );
  };

  input.connection.onconnectionstatechange = () => {
    input.entry.lastSignalProgressAtMs = Date.now();
    if (!input.isCurrentEntry(input.peerId, input.entry)) {
      return;
    }
    input.onPeerConnectionChange?.({
      peerId: input.peerId,
      state: input.connection.connectionState,
      ...(input.entry.linkKind === "media" ? { linkKind: "media" as const } : {})
    });

    if (input.connection.connectionState === "connected" &&
      (input.entry.linkKind === "media" || input.entry.channel?.readyState === "open")) {
      input.entry.reconnectAttempts = 0;
    }

      if (
        input.connection.connectionState === "failed" ||
        input.connection.connectionState === "closed"
      ) {
        if (input.isExpectedPeer(input.peerId)) {
        // MeshHealthMonitor and the room supervisor own the data link only.
        // A media failure must stay isolated to the media peer; reporting it
        // as a generic stall can tear down a healthy control channel.
        if (input.entry.linkKind === "data") {
          input.onPeerStalled?.({
            peerId: input.peerId,
            reason: "connection-failed"
          });
        }
        if (input.autoReconnect && input.entry.linkKind === "data") {
          input.schedulePeerReconnect(input.peerId, input.entry);
        }
        return;
      }

      input.releasePeer(input.peerId, input.entry);
      return;
    }

    if (input.entry.linkKind === "data") {
      input.schedulePeerWatchdog(input.peerId, input.entry);
    }
  };

  input.connection.oniceconnectionstatechange = () => {
    input.entry.lastSignalProgressAtMs = Date.now();
    if (!input.isCurrentEntry(input.peerId, input.entry)) {
      return;
    }
    input.onIceConnectionStateChange?.({
      peerId: input.peerId,
      state: input.connection.iceConnectionState,
      ...(input.entry.linkKind === "media" ? { linkKind: "media" as const } : {})
    });
    if (input.entry.linkKind === "data") {
      input.schedulePeerWatchdog(input.peerId, input.entry);
    }
  };

  input.connection.ondatachannel = (event) => {
    if ((input.linkKind ?? input.entry.linkKind) !== "data") {
      event.channel.close();
      return;
    }
    const channel = event.channel;
    if (channel.label !== "soqaro-control") {
      channel.close();
      return;
    }
    input.entry.channel = channel;
    input.bindChannel(input.peerId, input.entry, channel);
  };

  input.connection.ontrack = (event) => {
    if (!input.isCurrentEntry(input.peerId, input.entry)) {
      return;
    }
    if ((input.linkKind ?? input.entry.linkKind) !== "media") {
      return;
    }
    if (event.track.kind !== "audio") {
      return;
    }
    input.entry.audioReceiver = event.receiver ?? null;
    const receiver = event.receiver as (RTCRtpReceiver & {
      playoutDelayHint?: number;
      jitterBufferTarget?: number;
    }) | null;
    if (receiver && "playoutDelayHint" in receiver) {
      try {
        // Keep a little more audio in the browser jitter buffer on WAN/relay
        // paths. This absorbs short loss bursts without rebuilding the
        // MediaStream, which would be audible as a larger dropout.
        receiver.playoutDelayHint = receiverPlayoutDelaySeconds;
      } catch {
        // Older browsers expose the property but reject runtime updates.
      }
    }
    if (receiver && "jitterBufferTarget" in receiver) {
      try {
        receiver.jitterBufferTarget = receiverJitterBufferTargetMs;
      } catch {
        // Experimental in Chromium; ignore unsupported implementations.
      }
    }
    const streamWithTrack = event.streams.find((stream) => {
      try {
        return stream.getAudioTracks().some((track) => track.id === event.track.id);
      } catch {
        return false;
      }
    });
    const fallbackStream = event.streams[0] ?? null;
    input.entry.remoteAudioStream = streamWithTrack ??
      (typeof MediaStream !== "undefined"
        ? new MediaStream([event.track])
        : fallbackStream);
    input.entry.remoteAudioTrackId = event.track.id;
    input.entry.receiverRtpActive = event.track.muted !== true;
    input.entry.receiverTrackState = event.track.readyState === "live" ? "live" : "ended";
    if (input.entry.receiverTrackState === "live") {
      input.entry.mediaMissingTrackRecoveryAttempted = false;
    }
    input.onMediaStateChange?.({
      peerId: input.peerId,
      entry: input.entry,
      direction: "receiver",
      state: input.entry.receiverTrackState
    });
    input.onRemoteAudioTrack?.({
      peerId: input.peerId,
      entry: input.entry,
      track: event.track,
      streams: event.streams
    });
    event.track.onended = () => {
      if (input.entry.remoteAudioTrackId !== event.track.id) {
        return;
      }
      input.entry.receiverTrackState = "ended";
      input.entry.receiverRtpActive = false;
      input.onMediaStateChange?.({
        peerId: input.peerId,
        entry: input.entry,
        direction: "receiver",
        state: "ended"
      });
    };
    event.track.onmute = () => {
      if (input.entry.remoteAudioTrackId !== event.track.id) {
        return;
      }
      if (input.entry.receiverMuteTimerId) {
        clearTimeout(input.entry.receiverMuteTimerId);
      }
      // Remote tracks can briefly mute while the jitter buffer repairs a loss
      // burst. Only publish failed after a sustained mute so the room runtime
      // does not tear down a healthy audio element on every burst.
      input.entry.receiverMuteTimerId = setTimeout(() => {
        input.entry.receiverMuteTimerId = null;
        if (
          input.entry.remoteAudioTrackId === event.track.id &&
          event.track.muted &&
          event.track.readyState === "live"
        ) {
          input.entry.receiverRtpActive = false;
          // A live receiver track can remain muted while Chromium repairs its
          // jitter buffer. Keep the track live and let consecutive RTP stats
          // decide whether a connection recovery is actually necessary.
        }
      }, remoteTrackMuteGraceMs);
      input.onMediaTrackMuted?.({ peerId: input.peerId, trackId: event.track.id });
    };
    event.track.onunmute = () => {
      if (input.entry.remoteAudioTrackId !== event.track.id) {
        return;
      }
      if (input.entry.receiverMuteTimerId) {
        clearTimeout(input.entry.receiverMuteTimerId);
        input.entry.receiverMuteTimerId = null;
      }
      input.entry.receiverRtpActive = true;
      input.entry.receiverTrackState = "live";
      input.onMediaStateChange?.({
        peerId: input.peerId,
        entry: input.entry,
        direction: "receiver",
        state: "live"
      });
    };
  };
}

export function toIceCandidatePayload(candidate: RTCIceCandidateInit): Record<string, unknown> {
  return {
    candidate: candidate.candidate,
    ...(typeof candidate.sdpMid === "string" ? { sdpMid: candidate.sdpMid } : {}),
    ...(typeof candidate.sdpMLineIndex === "number"
      ? { sdpMLineIndex: candidate.sdpMLineIndex }
      : {}),
    ...(typeof candidate.usernameFragment === "string"
      ? { usernameFragment: candidate.usernameFragment }
      : {})
  };
}
