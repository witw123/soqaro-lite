import { describe, expect, it, vi } from "vitest";
import {
  PeerConnectionRegistry,
  clearPeerTimers,
  createPeerEntry,
  enqueuePeerOperation,
  flushPendingCandidates,
  isPeerStalled,
  shouldRestartPeer,
  startPeerStatsSampling,
  stopPeerStatsSampling
} from "./peer-connection-registry";

function buildConnection(
  input: Partial<
    Pick<
      RTCPeerConnection,
      "connectionState" | "iceConnectionState" | "remoteDescription" | "addIceCandidate"
    >
  > = {}
) {
  return {
    connectionState: input.connectionState ?? "new",
    ...(input.iceConnectionState !== undefined
      ? { iceConnectionState: input.iceConnectionState }
      : {}),
    remoteDescription: input.remoteDescription ?? null,
    addIceCandidate: input.addIceCandidate ?? (async () => undefined)
  } as RTCPeerConnection;
}

function buildDataChannel(readyState: RTCDataChannelState) {
  return {
    readyState
  } as RTCDataChannel;
}

describe("PeerConnectionRegistry", () => {
  it("tracks expected remote peers without the local peer", () => {
    const registry = new PeerConnectionRegistry("peer_a");

    const nextPeers = registry.setExpectedRemotePeerIds(["peer_a", "peer_b", "", "peer_c", "peer_b"]);

    expect([...nextPeers].sort()).toEqual(["peer_b", "peer_c"]);
    expect(registry.expects("peer_a")).toBe(false);
    expect(registry.expects("peer_b")).toBe(true);
  });

  it("only deletes an entry when it is still the current peer entry", () => {
    const registry = new PeerConnectionRegistry("peer_a");
    const firstEntry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });
    const replacementEntry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 200
    });

    registry.set("peer_b", firstEntry);
    registry.set("peer_b", replacementEntry);

    expect(registry.deleteIfCurrent("peer_b", firstEntry)).toBe(false);
    expect(registry.get("peer_b")).toBe(replacementEntry);
    expect(registry.deleteIfCurrent("peer_b", replacementEntry)).toBe(true);
    expect(registry.get("peer_b")).toBeNull();
  });

  it("builds peer entries with initialized lifecycle state", () => {
    const connection = buildConnection();
    const entry = createPeerEntry({
      connection,
      initiatorPeerId: "peer_a",
      nowMs: 1234
    });

    expect(entry).toMatchObject({
      connection,
      channel: null,
      initiatorPeerId: "peer_a",
      pendingCandidates: [],
      statsIntervalId: null,
      statsSnapshot: null,
      dataChannelState: null,
      createdAtMs: 1234,
      lastSignalProgressAtMs: 1234,
      reconnectAttempts: 0,
      reconnectTimerId: null,
      watchdogTimerId: null,
      releasing: false
    });
  });

  it("clears peer watchdog and reconnect timers", () => {
    const entry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });
    entry.watchdogTimerId = setTimeout(() => undefined, 1_000);
    entry.reconnectTimerId = setTimeout(() => undefined, 1_000);

    clearPeerTimers(entry);

    expect(entry.watchdogTimerId).toBeNull();
    expect(entry.reconnectTimerId).toBeNull();
  });

  it("flushes queued ICE candidates and keeps failed candidates until remote description exists", async () => {
    let shouldRejectCandidate = true;
    const addIceCandidate = vi.fn(async () => {
      if (shouldRejectCandidate) {
        throw new Error("candidate-race");
      }
    });
    const entry = createPeerEntry({
      connection: buildConnection({ addIceCandidate }),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });
    entry.pendingCandidates.push({ candidate: "candidate-1" });

    await flushPendingCandidates(entry);

    expect(addIceCandidate).toHaveBeenCalledWith({ candidate: "candidate-1" });
    expect(entry.pendingCandidates).toEqual([{ candidate: "candidate-1" }]);

    shouldRejectCandidate = false;
    Object.defineProperty(entry.connection, "remoteDescription", {
      value: { type: "offer", sdp: "remote-offer" },
      configurable: true
    });

    await flushPendingCandidates(entry);

    expect(entry.pendingCandidates).toEqual([]);
  });

  it("serializes peer operations and skips tasks once releasing", async () => {
    const entry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });
    const events: string[] = [];

    const first = enqueuePeerOperation(entry, async () => {
      events.push("first:start");
      await Promise.resolve();
      events.push("first:end");
      return "first";
    });
    const second = enqueuePeerOperation(entry, async () => {
      events.push("second");
      return "second";
    });

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second"]);

    entry.releasing = true;
    const skipped = await enqueuePeerOperation(entry, async () => {
      events.push("skipped");
      return "skipped";
    });

    expect(skipped).toBeUndefined();
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("starts and stops peer stats sampling", async () => {
    vi.useFakeTimers();
    try {
      const entry = createPeerEntry({
        connection: buildConnection(),
        initiatorPeerId: "peer_a",
        nowMs: 100
      });
      const onStatsSample = vi.fn();
      const sample = {
        candidateType: null,
        protocol: null,
        currentRoundTripTimeMs: null,
        availableOutgoingBitrateKbps: null,
        mediaReceiveBitrateKbps: null,
        mediaSendBitrateKbps: null,
        packetsLost: null,
        jitterMs: null
      };
      const snapshot = {
        inboundAudioBytes: 12,
        inboundAudioTimestampMs: null,
        outboundAudioBytes: null,
        outboundAudioTimestampMs: null,
        packetsLost: null,
        packetsTotal: null
      };
      const samplePeerConnectionStats = vi.fn(async () => ({
        snapshot,
        sample
      }));

      startPeerStatsSampling({
        peerId: "peer_b",
        entry,
        mode: "active",
        activeStatsSamplingIntervalMs: 1_000,
        steadyStatsSamplingIntervalMs: 5_000,
        onStatsSample,
        samplePeerConnectionStats
      });

      await Promise.resolve();

      expect(samplePeerConnectionStats).toHaveBeenCalledWith(entry.connection, null);
      expect(onStatsSample).toHaveBeenCalledWith({
        peerId: "peer_b",
        linkKind: "data",
        sample: {
          ...sample,
          connectionState: "new",
          iceConnectionState: null,
          dataChannelState: null
        }
      });
      expect(entry.statsSnapshot).toEqual(snapshot);
      expect(entry.statsIntervalId).not.toBeNull();

      stopPeerStatsSampling(entry);
      expect(entry.statsIntervalId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies stalled and restartable peer entries", () => {
    const entry = createPeerEntry({
      connection: buildConnection({ connectionState: "connecting" }),
      initiatorPeerId: null,
      nowMs: 100
    });

    expect(
      isPeerStalled({
        entry,
        nowMs: 1_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(false);

    expect(
      isPeerStalled({
        entry,
        nowMs: 16_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(true);

    entry.channel = buildDataChannel("open");
    expect(
      shouldRestartPeer({
        entry,
        nowMs: 20_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(false);

    const disconnectedEntry = createPeerEntry({
      connection: buildConnection({
        connectionState: "connected",
        iceConnectionState: "disconnected"
      }),
      initiatorPeerId: null,
      nowMs: 100
    });
    disconnectedEntry.channel = buildDataChannel("open");

    expect(
      isPeerStalled({
        entry: disconnectedEntry,
        nowMs: 1_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(false);
    expect(
      isPeerStalled({
        entry: disconnectedEntry,
        nowMs: 16_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(true);

    entry.channel = buildDataChannel("closed");
    expect(
      shouldRestartPeer({
        entry,
        nowMs: 20_000,
        dataOpenTimeoutMs: 8_000,
        dataConnectingTimeoutMs: 12_000,
        connectionProgressTimeoutMs: 15_000
      })
    ).toBe(true);
  });
});
