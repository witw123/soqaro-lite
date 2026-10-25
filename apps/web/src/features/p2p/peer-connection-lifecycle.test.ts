import { describe, expect, it, vi } from "vitest";
import { PeerConnectionLifecycleManager } from "./peer-connection-lifecycle-manager";
import { createPeerEntry } from "./peer-connection-registry";
import { SignalingTransport } from "./signaling-transport";
import {
  bindPeerConnectionEvents,
  buildPeerConnectionConfig,
  releasePeerConnectionEntry,
  resolveExistingPeerConnectionAction,
  shouldInitiatePeerConnection,
  toIceCandidatePayload
} from "./peer-connection-lifecycle";

class FakeDataChannel {
  label = "soqaro-control";
  readyState: RTCDataChannelState = "connecting";
  close = vi.fn(() => {
    this.readyState = "closed";
  });
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "connecting";
  iceConnectionState: RTCIceConnectionState = "checking";
  signalingState: RTCSignalingState = "stable";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  createDataChannel() {
    return new FakeDataChannel() as unknown as RTCDataChannel;
  }
  async createOffer() {
    this.signalingState = "have-local-offer";
    return { type: "offer" as const, sdp: "media-offer" };
  }
  async setLocalDescription(description?: RTCLocalSessionDescriptionInit) {
    if (description?.type === "rollback") {
      this.signalingState = "stable";
    }
  }
  close = vi.fn(() => {
    this.connectionState = "closed";
  });
}

function buildEntry(input: {
  connection?: FakePeerConnection;
  initiatorPeerId?: string | null;
  channel?: FakeDataChannel | null;
} = {}) {
  const entry = createPeerEntry({
    connection: (input.connection ?? new FakePeerConnection()) as unknown as RTCPeerConnection,
    initiatorPeerId: input.initiatorPeerId ?? null,
    nowMs: 100
  });
  entry.channel = (input.channel ?? null) as unknown as RTCDataChannel | null;
  return entry;
}

describe("peer connection lifecycle helpers", () => {
  it("serializes ICE candidate init fields for data peer signals", () => {
    expect(
      toIceCandidatePayload({
        candidate: "candidate-1",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: "ufrag"
      })
    ).toEqual({
      candidate: "candidate-1",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "ufrag"
    });
  });

  it("derives stable initiator and connection config decisions", () => {
    expect(shouldInitiatePeerConnection("peer_a", "peer_b")).toBe(true);
    expect(shouldInitiatePeerConnection("peer_b", "peer_a")).toBe(false);

    expect(
      buildPeerConnectionConfig({
        peerId: "peer_b",
        iceServers: [],
        resolveConnectionConfig: () => ({ bundlePolicy: "max-bundle" })
      })
    ).toMatchObject({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      bundlePolicy: "max-bundle"
    });
    expect(
      buildPeerConnectionConfig({
        peerId: "peer_b",
        iceServers: []
      })
    ).toMatchObject({
      iceTransportPolicy: "all",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 0
    });

    expect(
      buildPeerConnectionConfig({
        peerId: "peer_b",
        iceServers: [{ urls: "turn:example.test?transport=udp" }]
      })
    ).toMatchObject({
      iceServers: [{ urls: "turn:example.test?transport=udp" }]
    });
  });

  it("releases failed existing peers and reuses active entries", () => {
    const failedEntry = buildEntry();
    Object.defineProperty(failedEntry.connection, "connectionState", {
      value: "failed",
      configurable: true
    });
    expect(
      resolveExistingPeerConnectionAction({
        entry: failedEntry
      })
    ).toBe("release");

    const activeEntry = buildEntry({ initiatorPeerId: "peer_a" });
    expect(
      resolveExistingPeerConnectionAction({
        entry: activeEntry
      })
    ).toBe("reuse");
  });

  it("releases peer entries through the registry and dependent cleanup hooks", () => {
    const channel = new FakeDataChannel();
    const connection = new FakePeerConnection();
    const entry = buildEntry({ connection, channel });
    entry.watchdogTimerId = setTimeout(() => undefined, 1_000);
    entry.reconnectTimerId = setTimeout(() => undefined, 1_000);
    const deleteIfCurrent = vi.fn(() => true);
    const clearPendingRequestsForPeer = vi.fn();
    const stopStatsSampling = vi.fn();
    const onDataBufferedAmountChange = vi.fn();

    releasePeerConnectionEntry({
      peerId: "peer_b",
      entry,
      deleteIfCurrent,
      clearPendingRequestsForPeer,
      stopStatsSampling,
      onDataBufferedAmountChange
    });

    expect(entry.releasing).toBe(true);
    expect(entry.watchdogTimerId).toBeNull();
    expect(entry.reconnectTimerId).toBeNull();
    expect(deleteIfCurrent).toHaveBeenCalledWith("peer_b", entry);
    expect(clearPendingRequestsForPeer).toHaveBeenCalledWith("peer_b");
    expect(stopStatsSampling).toHaveBeenCalledWith(entry);
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
    expect(onDataBufferedAmountChange).toHaveBeenCalledWith({
      peerId: "peer_b",
      bufferedAmountBytes: 0
    });
  });

  it("binds connection, ICE, data-channel, and candidate lifecycle callbacks", () => {
    const connection = new FakePeerConnection();
    const entry = buildEntry({ connection, channel: new FakeDataChannel() });
    entry.reconnectAttempts = 3;
    const sendCandidate = vi.fn();
    const onPeerConnectionChange = vi.fn();
    const onIceConnectionStateChange = vi.fn();
    const onPeerStalled = vi.fn();
    const schedulePeerReconnect = vi.fn();
    const schedulePeerWatchdog = vi.fn();
    const releasePeer = vi.fn();
    const bindChannel = vi.fn();

    bindPeerConnectionEvents({
      peerId: "peer_b",
      entry,
      localPeerId: "peer_a",
      connection: connection as unknown as RTCPeerConnection,
      autoReconnect: true,
      isCurrentEntry: () => true,
      isExpectedPeer: () => true,
      sendCandidate,
      onPeerConnectionChange,
      onIceConnectionStateChange,
      onPeerStalled,
      schedulePeerReconnect,
      schedulePeerWatchdog,
      releasePeer,
      bindChannel
    });

    connection.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: "candidate-1" }) }
    } as RTCPeerConnectionIceEvent);
    expect(sendCandidate).toHaveBeenCalledWith("peer_b", { candidate: "candidate-1" });

    connection.connectionState = "connected";
    entry.channel = { readyState: "open" } as RTCDataChannel;
    connection.onconnectionstatechange?.();
    expect(entry.reconnectAttempts).toBe(0);
    expect(onPeerConnectionChange).toHaveBeenCalledWith({
      peerId: "peer_b",
      state: "connected"
    });
    expect(schedulePeerWatchdog).toHaveBeenCalledWith("peer_b", entry);

    connection.iceConnectionState = "connected";
    connection.oniceconnectionstatechange?.();
    expect(onIceConnectionStateChange).toHaveBeenCalledWith({
      peerId: "peer_b",
      state: "connected"
    });

    const remoteChannel = new FakeDataChannel();
    connection.ondatachannel?.({
      channel: remoteChannel
    } as unknown as RTCDataChannelEvent);
    expect(entry.channel).toBe(remoteChannel);
    expect(bindChannel).toHaveBeenCalledWith(
      "peer_b",
      entry,
      remoteChannel as unknown as RTCDataChannel
    );

    connection.connectionState = "failed";
    connection.onconnectionstatechange?.();
    expect(onPeerStalled).toHaveBeenCalledWith({
      peerId: "peer_b",
      reason: "connection-failed"
    });
    expect(schedulePeerReconnect).toHaveBeenCalledWith("peer_b", entry);
    expect(releasePeer).not.toHaveBeenCalled();
  });

  it("does not report a media connection failure as a data stall", () => {
    const connection = new FakePeerConnection();
    const entry = createPeerEntry({
      connection: connection as unknown as RTCPeerConnection,
      initiatorPeerId: null,
      nowMs: 100,
      linkKind: "media"
    });
    const onPeerStalled = vi.fn();

    bindPeerConnectionEvents({
      peerId: "peer_b",
      entry,
      localPeerId: "peer_a",
      connection: connection as unknown as RTCPeerConnection,
      linkKind: "media",
      autoReconnect: true,
      isCurrentEntry: () => true,
      isExpectedPeer: () => true,
      sendCandidate: vi.fn(),
      onPeerStalled,
      schedulePeerReconnect: vi.fn(),
      schedulePeerWatchdog: vi.fn(),
      releasePeer: vi.fn(),
      bindChannel: vi.fn()
    });

    connection.connectionState = "failed";
    connection.onconnectionstatechange?.();

    expect(onPeerStalled).not.toHaveBeenCalled();
  });

  it("does not treat an ontrack event as audible RTP until the track unmutes", () => {
    const connection = new FakePeerConnection();
    const entry = createPeerEntry({
      connection: connection as unknown as RTCPeerConnection,
      initiatorPeerId: null,
      nowMs: 100,
      linkKind: "media"
    });
    const track = {
      kind: "audio",
      id: "remote-track",
      readyState: "live",
      muted: true,
      onended: null,
      onmute: null,
      onunmute: null
    } as unknown as MediaStreamTrack;
    const stream = {} as MediaStream;

    bindPeerConnectionEvents({
      peerId: "peer_b",
      entry,
      localPeerId: "peer_a",
      connection: connection as unknown as RTCPeerConnection,
      linkKind: "media",
      autoReconnect: false,
      isCurrentEntry: () => true,
      isExpectedPeer: () => true,
      sendCandidate: vi.fn(),
      schedulePeerReconnect: vi.fn(),
      schedulePeerWatchdog: vi.fn(),
      releasePeer: vi.fn(),
      bindChannel: vi.fn()
    });

    connection.ontrack?.({
      track,
      streams: [stream]
    } as unknown as RTCTrackEvent);
    expect(entry.receiverTrackState).toBe("live");
    expect(entry.receiverRtpActive).toBe(false);

    Object.defineProperty(track, "muted", { value: false, configurable: true });
    (track.onunmute as (() => void) | null)?.();
    expect(entry.receiverRtpActive).toBe(true);
  });

  it("uses the correct units for receiver jitter buffering", () => {
    const connection = new FakePeerConnection();
    const entry = createPeerEntry({
      connection: connection as unknown as RTCPeerConnection,
      initiatorPeerId: null,
      nowMs: 100,
      linkKind: "media"
    });
    const track = {
      kind: "audio",
      id: "remote-track",
      readyState: "live",
      muted: false,
      onended: null,
      onmute: null,
      onunmute: null
    } as unknown as MediaStreamTrack;
    const receiver = {
      track,
      playoutDelayHint: 0,
      jitterBufferTarget: 0
    } as unknown as RTCRtpReceiver & {
      playoutDelayHint: number;
      jitterBufferTarget: number;
    };

    bindPeerConnectionEvents({
      peerId: "peer_b",
      entry,
      localPeerId: "peer_a",
      connection: connection as unknown as RTCPeerConnection,
      linkKind: "media",
      autoReconnect: false,
      isCurrentEntry: () => true,
      isExpectedPeer: () => true,
      sendCandidate: vi.fn(),
      schedulePeerReconnect: vi.fn(),
      schedulePeerWatchdog: vi.fn(),
      releasePeer: vi.fn(),
      bindChannel: vi.fn()
    });

    connection.ontrack?.({
      track,
      receiver,
      streams: []
    } as unknown as RTCTrackEvent);

    expect(receiver.playoutDelayHint).toBe(0.3);
    expect(receiver.jitterBufferTarget).toBe(300);
  });

  it("keeps a live receiver track usable while a mute recovery is pending", async () => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const signaling = new SignalingTransport({
      roomId: "room",
      localPeerId: "peer_a",
      sendSignal: vi.fn()
    });
    const manager = new PeerConnectionLifecycleManager({
      localPeerId: "peer_a",
      autoReconnect: false,
      iceServers: [],
      signaling,
      bindChannel: vi.fn(),
      clearPendingRequestsForPeer: vi.fn()
    });

    await manager.syncPeers(["peer_b"]);
    manager.setLocalAudioStream(null, "peer_b");
    await manager.syncPeers(["peer_b"]);
    const entry = manager.getPeerEntry("peer_b", "media")!;
    const track = {
      kind: "audio",
      id: "remote-track",
      readyState: "live"
    } as MediaStreamTrack;
    entry.audioReceiver = { track } as unknown as RTCRtpReceiver;
    entry.remoteAudioStream = { getAudioTracks: () => [track] } as unknown as MediaStream;
    entry.remoteAudioTrackId = track.id;
    entry.receiverTrackState = "failed";

    expect(manager.getPeerMediaState("peer_b")).toMatchObject({
      receiverTrackState: "live",
      remoteStream: entry.remoteAudioStream
    });
    vi.unstubAllGlobals();
  });

  it("keeps a sustained mute as a live track until RTP stats confirm recovery is needed", async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakePeerConnection();
      const entry = buildEntry({ connection });
      entry.linkKind = "media";
      const track = {
        kind: "audio",
        id: "muted-track",
        readyState: "live",
        muted: false,
        onended: null,
        onmute: null,
        onunmute: null
      } as unknown as MediaStreamTrack;
      const onMediaStateChange = vi.fn();

      bindPeerConnectionEvents({
        peerId: "peer_b",
        entry,
        localPeerId: "peer_a",
        connection: connection as unknown as RTCPeerConnection,
        linkKind: "media",
        autoReconnect: false,
        isCurrentEntry: () => true,
        isExpectedPeer: () => true,
        sendCandidate: vi.fn(),
        schedulePeerReconnect: vi.fn(),
        schedulePeerWatchdog: vi.fn(),
        releasePeer: vi.fn(),
        bindChannel: vi.fn(),
        onMediaStateChange
      });

      connection.ontrack?.({
        track,
        streams: []
      } as unknown as RTCTrackEvent);
      Object.defineProperty(track, "muted", { value: true, configurable: true });
      (track.onmute as (() => void) | null)?.();
      await vi.advanceTimersByTimeAsync(3_000);

      expect(entry.receiverTrackState).toBe("live");
      expect(entry.receiverRtpActive).toBe(false);
      expect(onMediaStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
    } finally {
      vi.useRealTimers();
    }
  });
});
