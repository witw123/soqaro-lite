import { describe, expect, it } from "vitest";
import { createPeerSnapshot } from "@/features/p2p/diagnostics";
import {
  buildWanLinkScore,
  buildWanLinkScoreFromPeerDiagnostic,
  resolveWanPathLabel
} from "./wan-link-score";

describe("wan link score helpers", () => {
  it("labels direct and relay paths in Chinese", () => {
    expect(resolveWanPathLabel({
      candidateType: "prflx",
      protocol: "udp",
      profile: "standard-direct"
    })).toBe("直连 (prflx/udp)");
    expect(resolveWanPathLabel({
      candidateType: "relay",
      relayProtocol: "udp",
      profile: "relay-udp"
    })).toBe("中继 (relay/udp)");
  });

  it("scores throughput against the actual Opus bitrate", () => {
    const score = buildWanLinkScore({
      candidateType: "relay",
      relayProtocol: "udp",
      rttMs: 59,
      downloadRateKbps: 1_040,
      uploadRateKbps: 0,
      playbackBitrateKbps: 192,
      transportScore: "healthy",
      dataChannelState: "open",
      providers: [{ peerId: "peer_1", availableUnits: 8, totalUnits: 160 }]
    });

    expect(score.metrics.audioBitrateLabel).toBe("192 kbps");
    expect(score.metrics.headroomLabel).toBe("5.4x");
    expect(score.tips.join(" ")).not.toContain("FLAC");
    expect(score.tips.join(" ")).not.toContain("pcm-buffer-missing");
  });

  it("penalizes throughput below the playback bitrate", () => {
    const healthy = buildWanLinkScore({
      candidateType: "host",
      protocol: "udp",
      rttMs: 30,
      downloadRateKbps: 1_000,
      playbackBitrateKbps: 192,
      dataChannelState: "open"
    });
    const starved = buildWanLinkScore({
      candidateType: "host",
      protocol: "udp",
      rttMs: 30,
      downloadRateKbps: 120,
      playbackBitrateKbps: 192,
      dataChannelState: "open"
    });

    expect(healthy.score).toBeGreaterThan(starved.score);
    expect(starved.metrics.headroomLabel).toBe("0.6x");
  });

  it("builds a score snapshot from peer diagnostics", () => {
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-12T00:00:00.000Z");
    diagnostic.dataCandidateType = "relay";
    diagnostic.dataRelayProtocol = "udp";
    diagnostic.dataChannelState = "open";
    diagnostic.currentRoundTripTimeMs = 180;

    const score = buildWanLinkScoreFromPeerDiagnostic({
      diagnostic,
      playbackBitrateKbps: 192,
      providers: [{ peerId: "peer_1", availableUnits: 5, totalUnits: 100 }]
    });

    expect(score.profile).toBe("relay-udp");
    expect(score.metrics.providerLabel).toBe("1 条媒体连接");
  });

  it("scores the RTP direction instead of the data-channel direction", () => {
    const base = buildWanLinkScore({
      candidateType: "host",
      protocol: "udp",
      rttMs: 24,
      downloadRateKbps: 0,
      uploadRateKbps: 960,
      playbackBitrateKbps: 192,
      mediaDirection: "send",
      mediaTrackState: "live",
      mediaConnectionState: "connected",
      packetLossRate: 0,
      jitterMs: 8,
      dataChannelState: "open",
      transportScore: "healthy",
      bufferedAmountBytes: 0
    });
    const dataDegraded = buildWanLinkScore({
      candidateType: "host",
      protocol: "udp",
      rttMs: 24,
      downloadRateKbps: 0,
      uploadRateKbps: 960,
      playbackBitrateKbps: 192,
      mediaDirection: "send",
      mediaTrackState: "live",
      mediaConnectionState: "connected",
      packetLossRate: 0,
      jitterMs: 8,
      dataChannelState: "closed",
      transportScore: "failed",
      bufferedAmountBytes: 16 * 1024 * 1024
    });

    expect(base.metrics.directionLabel).toBe("发送");
    expect(base.metrics.headroomLabel).toBe("5.0x");
    expect(dataDegraded.score).toBe(base.score);
  });

  it("penalizes RTP loss and jitter while keeping a healthy media path high", () => {
    const healthy = buildWanLinkScore({
      candidateType: "srflx",
      protocol: "udp",
      rttMs: 30,
      downloadRateKbps: 800,
      playbackBitrateKbps: 192,
      mediaDirection: "receive",
      mediaTrackState: "live",
      mediaConnectionState: "connected",
      packetLossRate: 0,
      jitterMs: 8
    });
    const impaired = buildWanLinkScore({
      candidateType: "srflx",
      protocol: "udp",
      rttMs: 30,
      downloadRateKbps: 800,
      playbackBitrateKbps: 192,
      mediaDirection: "receive",
      mediaTrackState: "live",
      mediaConnectionState: "connected",
      packetLossRate: 6,
      jitterMs: 55
    });

    expect(healthy.score).toBeGreaterThan(impaired.score);
    expect(impaired.metrics.packetLossLabel).toBe("6.0%");
    expect(impaired.metrics.jitterLabel).toBe("55ms");
  });
});
