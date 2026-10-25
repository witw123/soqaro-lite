import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeerEntry, type PeerEntry } from "./peer-connection-registry";
import { MeshHealthMonitor } from "./mesh-health-monitor";

function buildConnection(connectionState: RTCPeerConnectionState = "connecting") {
  return {
    connectionState
  } as RTCPeerConnection;
}

function buildEntry(input: {
  nowMs: number;
  connectionState?: RTCPeerConnectionState;
  channelState?: RTCDataChannelState;
}) {
  const entry = createPeerEntry({
    connection: buildConnection(input.connectionState),
    initiatorPeerId: "peer_a",
    nowMs: input.nowMs
  });
  if (input.channelState) {
    entry.channel = {
      readyState: input.channelState
    } as RTCDataChannel;
  }
  return entry;
}

function createMonitor(input: {
  autoReconnect?: boolean;
  expectedPeerIds?: string[];
  currentEntry?: PeerEntry;
  onPeerStalled?: (payload: {
    peerId: string;
    reason: "watchdog-timeout" | "connection-failed" | "data-channel-closed";
  }) => void;
  releasePeer?: (peerId: string, entry: PeerEntry) => void;
  recreatePeer?: (peerId: string, entry: PeerEntry) => Promise<PeerEntry>;
} = {}) {
  const expectedPeerIds = new Set(input.expectedPeerIds ?? ["peer_b"]);
  return new MeshHealthMonitor({
    autoReconnect: input.autoReconnect ?? true,
    reconnectBackoffMs: [1_000, 2_000, 4_000, 8_000],
    dataOpenTimeoutMs: 8_000,
    dataConnectingTimeoutMs: 12_000,
    connectionProgressTimeoutMs: 15_000,
    isExpectedPeer: (peerId) => expectedPeerIds.has(peerId),
    getPeerEntry: () => input.currentEntry ?? null,
    onPeerStalled: input.onPeerStalled,
    releasePeer: input.releasePeer ?? vi.fn(),
    recreatePeer: input.recreatePeer ?? vi.fn(async (_, entry) => entry)
  });
}

describe("MeshHealthMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports stalled peers from the watchdog and schedules reconnect when enabled", async () => {
    const entry = buildEntry({
      nowMs: 0,
      connectionState: "connecting",
      channelState: "connecting"
    });
    const onPeerStalled = vi.fn();
    const recreatePeer = vi.fn(async (_, currentEntry: PeerEntry) => currentEntry);
    const monitor = createMonitor({
      currentEntry: entry,
      onPeerStalled,
      recreatePeer
    });

    monitor.schedulePeerWatchdog("peer_b", entry);
    vi.setSystemTime(16_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onPeerStalled).toHaveBeenCalledWith({
      peerId: "peer_b",
      reason: "watchdog-timeout"
    });
    expect(entry.reconnectAttempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(recreatePeer).toHaveBeenCalledWith("peer_b", entry);
  });

  it("does not schedule duplicate reconnect timers", async () => {
    const entry = buildEntry({
      nowMs: 0,
      connectionState: "connecting"
    });
    const recreatePeer = vi.fn(async (_, currentEntry: PeerEntry) => currentEntry);
    const monitor = createMonitor({
      currentEntry: entry,
      recreatePeer
    });

    monitor.schedulePeerReconnect("peer_b", entry);
    monitor.schedulePeerReconnect("peer_b", entry);

    expect(entry.reconnectAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recreatePeer).toHaveBeenCalledTimes(1);
  });

  it("releases peers that are no longer expected when reconnect is requested", () => {
    const entry = buildEntry({
      nowMs: 0,
      connectionState: "failed"
    });
    const releasePeer = vi.fn();
    const monitor = createMonitor({
      expectedPeerIds: [],
      currentEntry: entry,
      releasePeer
    });

    monitor.schedulePeerReconnect("peer_b", entry);

    expect(releasePeer).toHaveBeenCalledWith("peer_b", entry);
    expect(entry.reconnectTimerId).toBeNull();
  });
});
