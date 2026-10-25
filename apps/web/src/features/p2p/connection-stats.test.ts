import { describe, expect, it } from "vitest";
import {
  samplePeerConnectionStats,
  type PeerConnectionStatsSnapshot
} from "./connection-stats";

function buildStatsReport(stats: Array<Record<string, unknown>>) {
  return new Map(
    stats.map((stat) => [
      stat.id as string,
      stat as RTCStats & Record<string, unknown>
    ])
  );
}

describe("samplePeerConnectionStats", () => {
  it("reports the selected relay udp candidate path explicitly", async () => {
    const connection = {
      connectionState: "connected",
      iceConnectionState: "connected",
      getStats: async () =>
        buildStatsReport([
          {
            id: "transport_1",
            type: "transport",
            timestamp: 1_000,
            selectedCandidatePairId: "pair_1"
          },
          {
            id: "pair_1",
            type: "candidate-pair",
            timestamp: 1_000,
            state: "succeeded",
            currentRoundTripTime: 0.048,
            availableOutgoingBitrate: 5_200_000,
            localCandidateId: "local_1",
            remoteCandidateId: "remote_1"
          },
          {
            id: "local_1",
            type: "local-candidate",
            timestamp: 1_000,
            candidateType: "relay",
            protocol: "udp",
            relayProtocol: "udp"
          },
          {
            id: "remote_1",
            type: "remote-candidate",
            timestamp: 1_000,
            candidateType: "srflx",
            protocol: "udp"
          }
        ])
    } as unknown as RTCPeerConnection;

    const result = await samplePeerConnectionStats(connection, null);

    expect(result?.sample).toMatchObject({
      candidateType: "relay",
      localCandidateType: "relay",
      remoteCandidateType: "srflx",
      protocol: "udp",
      relayProtocol: "udp",
      currentRoundTripTimeMs: 48,
      availableOutgoingBitrateKbps: 5200,
      connectionState: "connected",
      iceConnectionState: "connected"
    });
  });

  it("reports relay tcp as tcp even when the remote candidate omits protocol", async () => {
    const connection = {
      getStats: async () =>
        buildStatsReport([
          {
            id: "pair_1",
            type: "candidate-pair",
            timestamp: 1_000,
            selected: true,
            currentRoundTripTime: 0.31,
            localCandidateId: "local_1",
            remoteCandidateId: "remote_1"
          },
          {
            id: "local_1",
            type: "local-candidate",
            timestamp: 1_000,
            candidateType: "host",
            protocol: "udp"
          },
          {
            id: "remote_1",
            type: "remote-candidate",
            timestamp: 1_000,
            candidateType: "relay",
            relayProtocol: "tcp"
          }
        ])
    } as unknown as RTCPeerConnection;

    const result = await samplePeerConnectionStats(connection, null);

    expect(result?.sample).toMatchObject({
      candidateType: "relay",
      localCandidateType: "host",
      remoteCandidateType: "relay",
      protocol: "tcp",
      relayProtocol: "tcp",
      currentRoundTripTimeMs: 310
    });
  });

  it("returns null path fields when no selected candidate pair exists", async () => {
    const connection = {
      getStats: async () =>
        buildStatsReport([
          {
            id: "transport_1",
            type: "transport",
            timestamp: 1_000
          }
        ])
    } as unknown as RTCPeerConnection;

    const result = await samplePeerConnectionStats(connection, null);

    expect(result?.sample).toMatchObject({
      candidateType: null,
      localCandidateType: null,
      remoteCandidateType: null,
      protocol: null,
      relayProtocol: null,
      currentRoundTripTimeMs: null
    });
  });

  it("derives short-window packet loss rate from cumulative WebRTC counters", async () => {
    const connection = {
      getStats: async () =>
        buildStatsReport([
          {
            id: "transport_1",
            type: "transport",
            timestamp: 1_000,
            selectedCandidatePairId: "pair_1"
          },
          {
            id: "pair_1",
            type: "candidate-pair",
            timestamp: 1_000,
            state: "succeeded",
            currentRoundTripTime: 0.062,
            availableOutgoingBitrate: 320_000,
            localCandidateId: "local_1",
            remoteCandidateId: "remote_1"
          },
          {
            id: "local_1",
            type: "local-candidate",
            timestamp: 1_000,
            candidateType: "host",
            protocol: "udp"
          },
          {
            id: "remote_1",
            type: "remote-candidate",
            timestamp: 1_000,
            candidateType: "srflx",
            protocol: "udp"
          },
          {
            id: "inbound_1",
            type: "inbound-rtp",
            timestamp: 1_000,
            kind: "audio",
            lastPacketReceivedTimestamp: 1_050,
            bytesReceived: 10_000,
            packetsLost: 5,
            packetsReceived: 95,
            jitter: 0.004
          },
          {
            id: "outbound_1",
            type: "outbound-rtp",
            timestamp: 1_000,
            kind: "audio",
            lastPacketSentTimestamp: 1_060,
            bytesSent: 8_000
          }
        ])
    } as unknown as RTCPeerConnection;

    const firstSample = await samplePeerConnectionStats(connection, null);
    expect(firstSample?.sample.packetLossRate).toBeNull();

    const nextConnection = {
      getStats: async () =>
        buildStatsReport([
          {
            id: "transport_1",
            type: "transport",
            timestamp: 3_000,
            selectedCandidatePairId: "pair_1"
          },
          {
            id: "pair_1",
            type: "candidate-pair",
            timestamp: 3_000,
            state: "succeeded",
            currentRoundTripTime: 0.058,
            availableOutgoingBitrate: 420_000,
            localCandidateId: "local_1",
            remoteCandidateId: "remote_1"
          },
          {
            id: "local_1",
            type: "local-candidate",
            timestamp: 3_000,
            candidateType: "host",
            protocol: "udp"
          },
          {
            id: "remote_1",
            type: "remote-candidate",
            timestamp: 3_000,
            candidateType: "srflx",
            protocol: "udp"
          },
          {
            id: "inbound_1",
            type: "inbound-rtp",
            timestamp: 3_000,
            kind: "audio",
            lastPacketReceivedTimestamp: 3_050,
            bytesReceived: 40_000,
            packetsLost: 8,
            packetsReceived: 192,
            jitter: 0.003
          },
          {
            id: "outbound_1",
            type: "outbound-rtp",
            timestamp: 3_000,
            kind: "audio",
            lastPacketSentTimestamp: 3_060,
            bytesSent: 12_000
          }
        ])
    } as unknown as RTCPeerConnection;

    const secondSample = await samplePeerConnectionStats(
      nextConnection,
      firstSample?.snapshot as PeerConnectionStatsSnapshot
    );

    expect(secondSample?.sample.packetsLost).toBe(8);
    expect(secondSample?.sample.packetLossRate).toBe(3);
    expect(secondSample?.sample.mediaReceiveBitrateKbps).toBe(120);
    expect(secondSample?.sample.lastMediaReceivePacketAtMs).toBe(3_050);
    expect(secondSample?.sample.lastMediaSendPacketAtMs).toBe(3_060);
    expect(secondSample?.sample.lastMediaPacketAtMs).toBe(3_050);
  });
});
