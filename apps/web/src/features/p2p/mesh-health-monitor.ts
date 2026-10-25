import {
  clearPeerWatchdog,
  isPeerStalled,
  type PeerEntry
} from "./peer-connection-registry";

type PeerStalledReason = "watchdog-timeout" | "connection-failed" | "data-channel-closed";

type MeshHealthMonitorInput = {
  autoReconnect: boolean;
  reconnectBackoffMs: readonly number[];
  dataOpenTimeoutMs: number;
  passiveNegotiationTimeoutMs?: number;
  dataConnectingTimeoutMs: number;
  connectionProgressTimeoutMs: number;
  isExpectedPeer: (peerId: string) => boolean;
  getPeerEntry: (peerId: string) => PeerEntry | null;
  onPeerStalled?: (payload: {
    peerId: string;
    reason: PeerStalledReason;
  }) => void;
  releasePeer: (peerId: string, entry: PeerEntry) => void;
  recreatePeer: (peerId: string, entry: PeerEntry) => Promise<PeerEntry | null>;
};

export class MeshHealthMonitor {
  private readonly autoReconnect: boolean;
  private readonly reconnectBackoffMs: readonly number[];
  private readonly dataOpenTimeoutMs: number;
  private readonly passiveNegotiationTimeoutMs: number;
  private readonly dataConnectingTimeoutMs: number;
  private readonly connectionProgressTimeoutMs: number;
  private readonly isExpectedPeer: (peerId: string) => boolean;
  private readonly getPeerEntry: (peerId: string) => PeerEntry | null;
  private readonly onPeerStalled?: MeshHealthMonitorInput["onPeerStalled"];
  private readonly releasePeer: (peerId: string, entry: PeerEntry) => void;
  private readonly recreatePeer: (peerId: string, entry: PeerEntry) => Promise<PeerEntry | null>;

  constructor(input: MeshHealthMonitorInput) {
    this.autoReconnect = input.autoReconnect;
    this.reconnectBackoffMs = input.reconnectBackoffMs;
    this.dataOpenTimeoutMs = input.dataOpenTimeoutMs;
    this.passiveNegotiationTimeoutMs =
      input.passiveNegotiationTimeoutMs ?? input.dataOpenTimeoutMs;
    this.dataConnectingTimeoutMs = input.dataConnectingTimeoutMs;
    this.connectionProgressTimeoutMs = input.connectionProgressTimeoutMs;
    this.isExpectedPeer = input.isExpectedPeer;
    this.getPeerEntry = input.getPeerEntry;
    this.onPeerStalled = input.onPeerStalled;
    this.releasePeer = input.releasePeer;
    this.recreatePeer = input.recreatePeer;
  }

  schedulePeerWatchdog(peerId: string, entry: PeerEntry) {
    if (entry.releasing || !this.isExpectedPeer(peerId)) {
      clearPeerWatchdog(entry);
      return;
    }

    clearPeerWatchdog(entry);
    entry.watchdogTimerId = setTimeout(() => {
      if (!this.isCurrentExpectedEntry(peerId, entry)) {
        return;
      }

      if (this.isPeerEntryStalled(entry, Date.now())) {
        this.onPeerStalled?.({
          peerId,
          reason: "watchdog-timeout"
        });
        if (this.autoReconnect) {
          this.schedulePeerReconnect(peerId, entry);
        }
        return;
      }

      this.schedulePeerWatchdog(peerId, entry);
    }, 1_000);
  }

  schedulePeerReconnect(peerId: string, entry: PeerEntry) {
    if (entry.releasing || !this.isExpectedPeer(peerId)) {
      this.releasePeer(peerId, entry);
      return;
    }

    clearPeerWatchdog(entry);
    if (entry.reconnectTimerId) {
      return;
    }

    const delay =
      this.reconnectBackoffMs[
        Math.min(entry.reconnectAttempts, this.reconnectBackoffMs.length - 1)
      ] ?? 0;
    entry.reconnectAttempts += 1;
    entry.reconnectTimerId = setTimeout(() => {
      entry.reconnectTimerId = null;
      if (!this.isCurrentExpectedEntry(peerId, entry)) {
        return;
      }

      void this.recreatePeer(peerId, entry);
    }, delay);
  }

  private isCurrentExpectedEntry(peerId: string, entry: PeerEntry) {
    return this.getPeerEntry(peerId) === entry && !entry.releasing && this.isExpectedPeer(peerId);
  }

  private isPeerEntryStalled(entry: PeerEntry, nowMs: number) {
    return isPeerStalled({
      entry,
      nowMs,
      dataOpenTimeoutMs: this.dataOpenTimeoutMs,
      passiveNegotiationTimeoutMs: this.passiveNegotiationTimeoutMs,
      dataConnectingTimeoutMs: this.dataConnectingTimeoutMs,
      connectionProgressTimeoutMs: this.connectionProgressTimeoutMs
    });
  }
}
