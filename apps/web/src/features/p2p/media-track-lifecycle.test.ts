import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerConnectionLifecycleManager } from "./peer-connection-lifecycle-manager";
import { SignalingTransport } from "./signaling-transport";

class FakeSender {
  track: MediaStreamTrack | null;
  lastParameters: RTCRtpSendParameters | null = null;
  readonly setParameters = vi.fn(async (parameters: RTCRtpSendParameters) => {
    this.lastParameters = parameters;
  });

  constructor(track: MediaStreamTrack) {
    this.track = track;
  }

  getParameters() {
    return { encodings: [{}] } as RTCRtpSendParameters;
  }

  async replaceTrack(track: MediaStreamTrack | null) {
    this.track = track;
  }
}

class FakeDataChannel {
  readyState: RTCDataChannelState = "open";
  close() {
    this.readyState = "closed";
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  connectionState: RTCPeerConnectionState = "connected";
  iceConnectionState: RTCIceConnectionState = "connected";
  signalingState: RTCSignalingState = "stable";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly addTrack = vi.fn((track: MediaStreamTrack) => new FakeSender(track) as unknown as RTCRtpSender);

  constructor() {
    FakePeerConnection.instances.push(this);
  }

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

  close() {
    this.connectionState = "closed";
  }
}

function buildStream(track: MediaStreamTrack) {
  return {
    getAudioTracks: () => [track]
  } as unknown as MediaStream;
}

describe("WebRTC media track lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    FakePeerConnection.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds a track only when the local peer is the current source", async () => {
    const sendSignal = vi.fn();
    const signaling = new SignalingTransport({
      roomId: "room",
      localPeerId: "peer_a",
      sendSignal
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
    const track = { kind: "audio", readyState: "live", id: "track_a" } as MediaStreamTrack;
    manager.setLocalAudioStream(buildStream(track), "peer_a", 256);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const connection = FakePeerConnection.instances[1]!;
    expect(connection.addTrack).toHaveBeenCalledWith(track, expect.anything());
    const sender = (manager.getPeerEntry("peer_b", "media")?.audioSender as unknown) as FakeSender;
    expect(sender.lastParameters?.encodings?.[0]).toMatchObject({
      maxBitrate: 256_000,
      priority: "high",
      networkPriority: "high"
    });
    expect(sendSignal).toHaveBeenCalledWith(expect.objectContaining({ type: "offer" }));
    expect(manager.getPeerMediaState("peer_b")).toMatchObject({
      senderTrackState: "live",
      receiverTrackState: "none"
    });

    manager.setLocalAudioStream(buildStream(track), "peer_b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getPeerEntry("peer_b", "media")?.senderTrackState).toBe("none");
  });
});
