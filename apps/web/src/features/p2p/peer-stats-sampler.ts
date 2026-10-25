import {
  samplePeerConnectionStats,
  type PeerConnectionStatsSample,
  type PeerConnectionStatsSnapshot
} from "./connection-stats";
import {
  startPeerStatsSampling,
  stopPeerStatsSampling,
  type PeerEntry
} from "./peer-connection-registry";

type StatsSamplingMode = "off" | "steady" | "active";

export class PeerStatsSampler {
  private mode: StatsSamplingMode = "active";

  constructor(
    private readonly input: {
      activeStatsSamplingIntervalMs: number;
      steadyStatsSamplingIntervalMs: number;
      activeMediaStatsSamplingIntervalMs?: number;
      steadyMediaStatsSamplingIntervalMs?: number;
      activeDataStatsSamplingIntervalMs?: number;
      steadyDataStatsSamplingIntervalMs?: number;
      shouldSampleEntry?: (peerId: string, entry: PeerEntry) => boolean;
      onStatsSample?: (payload: {
        peerId: string;
        linkKind: PeerEntry["linkKind"];
        sample: PeerConnectionStatsSample;
      }) => void;
      samplePeerConnectionStats?: (
        connection: RTCPeerConnection,
        previousSnapshot: PeerConnectionStatsSnapshot | null
      ) => Promise<{
        sample: PeerConnectionStatsSample;
        snapshot: PeerConnectionStatsSnapshot;
      } | null>;
    }
  ) {}

  setMode(mode: StatsSamplingMode, entries: Iterable<[string, PeerEntry]>) {
    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    for (const [peerId, entry] of entries) {
      this.stop(entry);
      this.start(peerId, entry);
    }
  }

  start(peerId: string, entry: PeerEntry) {
    if (this.input.shouldSampleEntry && !this.input.shouldSampleEntry(peerId, entry)) {
      this.stop(entry);
      return;
    }
    const isMedia = entry.linkKind === "media";
    startPeerStatsSampling({
      peerId,
      entry,
      mode: this.mode,
      activeStatsSamplingIntervalMs: isMedia
        ? this.input.activeMediaStatsSamplingIntervalMs ?? this.input.activeStatsSamplingIntervalMs
        : this.input.activeDataStatsSamplingIntervalMs ?? this.input.activeStatsSamplingIntervalMs,
      steadyStatsSamplingIntervalMs: isMedia
        ? this.input.steadyMediaStatsSamplingIntervalMs ?? this.input.steadyStatsSamplingIntervalMs
        : this.input.steadyDataStatsSamplingIntervalMs ?? this.input.steadyStatsSamplingIntervalMs,
      onStatsSample: this.input.onStatsSample,
      samplePeerConnectionStats: this.input.samplePeerConnectionStats ?? samplePeerConnectionStats
    });
  }

  stop(entry: PeerEntry) {
    stopPeerStatsSampling(entry);
  }
}
