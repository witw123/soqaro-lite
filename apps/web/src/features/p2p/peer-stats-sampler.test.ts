import { describe, expect, it, vi } from "vitest";
import { createPeerEntry } from "./peer-connection-registry";
import { PeerStatsSampler } from "./peer-stats-sampler";
import type {
  PeerConnectionStatsSample,
  PeerConnectionStatsSnapshot
} from "./connection-stats";

function buildConnection() {
  return {} as RTCPeerConnection;
}

describe("PeerStatsSampler", () => {
  it("starts, restarts, and stops sampling for peer entries as the mode changes", async () => {
    vi.useFakeTimers();
    try {
      const sample = {
        candidateType: null,
        protocol: null,
        currentRoundTripTimeMs: null,
        availableOutgoingBitrateKbps: null,
        mediaReceiveBitrateKbps: null,
        mediaSendBitrateKbps: null,
        packetsLost: null,
        jitterMs: null
      } satisfies PeerConnectionStatsSample;
      const snapshot = {
        inboundAudioBytes: 1,
        inboundAudioTimestampMs: null,
        outboundAudioBytes: null,
        outboundAudioTimestampMs: null,
        packetsLost: null,
        packetsTotal: null
      } satisfies PeerConnectionStatsSnapshot;
      const samplePeerConnectionStats = vi.fn(async () => ({
        sample,
        snapshot
      }));
      const onStatsSample = vi.fn();
      const sampler = new PeerStatsSampler({
        activeStatsSamplingIntervalMs: 1_000,
        steadyStatsSamplingIntervalMs: 5_000,
        onStatsSample,
        samplePeerConnectionStats
      });
      const entry = createPeerEntry({
        connection: buildConnection(),
        initiatorPeerId: "peer_a",
        nowMs: 100
      });

      sampler.start("peer_b", entry);
      await Promise.resolve();

      expect(samplePeerConnectionStats).toHaveBeenCalledWith(entry.connection, null);
      expect(onStatsSample).toHaveBeenCalledWith({
        peerId: "peer_b",
        linkKind: "data",
        sample: {
          ...sample,
          connectionState: null,
          iceConnectionState: null,
          dataChannelState: null
        }
      });
      expect(entry.statsIntervalId).not.toBeNull();

      sampler.setMode("off", [["peer_b", entry]]);
      expect(entry.statsIntervalId).toBeNull();

      sampler.setMode("steady", [["peer_b", entry]]);
      await Promise.resolve();

      expect(entry.statsIntervalId).not.toBeNull();
      sampler.stop(entry);
      expect(entry.statsIntervalId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing without a stats callback", () => {
    const sampler = new PeerStatsSampler({
      activeStatsSamplingIntervalMs: 1_000,
      steadyStatsSamplingIntervalMs: 5_000,
      samplePeerConnectionStats: vi.fn()
    });
    const entry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });

    sampler.start("peer_b", entry);

    expect(entry.statsIntervalId).toBeNull();
  });

  it("skips entries rejected by the sampling eligibility policy", () => {
    const sampler = new PeerStatsSampler({
      activeStatsSamplingIntervalMs: 1_000,
      steadyStatsSamplingIntervalMs: 5_000,
      onStatsSample: vi.fn(),
      samplePeerConnectionStats: vi.fn(),
      shouldSampleEntry: () => false
    });
    const entry = createPeerEntry({
      connection: buildConnection(),
      initiatorPeerId: "peer_a",
      nowMs: 100
    });

    sampler.start("peer_b", entry);

    expect(entry.statsIntervalId).toBeNull();
  });

  it("does not overlap slow stats reads", async () => {
    vi.useFakeTimers();
    try {
      const sample = {
        candidateType: null,
        protocol: null,
        currentRoundTripTimeMs: null,
        availableOutgoingBitrateKbps: null,
        mediaReceiveBitrateKbps: null,
        mediaSendBitrateKbps: null,
        packetsLost: null,
        jitterMs: null
      } satisfies PeerConnectionStatsSample;
      const snapshot = {
        inboundAudioBytes: null,
        inboundAudioTimestampMs: null,
        outboundAudioBytes: null,
        outboundAudioTimestampMs: null,
        packetsLost: null,
        packetsTotal: null
      } satisfies PeerConnectionStatsSnapshot;
      let resolveSample!: (value: {
        sample: PeerConnectionStatsSample;
        snapshot: PeerConnectionStatsSnapshot;
      }) => void;
      const samplePeerConnectionStats = vi.fn(() => new Promise<{
        sample: PeerConnectionStatsSample;
        snapshot: PeerConnectionStatsSnapshot;
      }>((resolve) => {
        resolveSample = resolve;
      }));
      const sampler = new PeerStatsSampler({
        activeStatsSamplingIntervalMs: 1_000,
        steadyStatsSamplingIntervalMs: 5_000,
        onStatsSample: vi.fn(),
        samplePeerConnectionStats
      });
      const entry = createPeerEntry({
        connection: buildConnection(),
        initiatorPeerId: "peer_a",
        nowMs: 100
      });

      sampler.start("peer_b", entry);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(samplePeerConnectionStats).toHaveBeenCalledTimes(1);

      resolveSample({ sample, snapshot });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(samplePeerConnectionStats).toHaveBeenCalledTimes(2);
      sampler.stop(entry);
    } finally {
      vi.useRealTimers();
    }
  });
});
