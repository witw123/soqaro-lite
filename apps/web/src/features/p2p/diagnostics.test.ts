import { describe, expect, it } from "vitest";
import {
  createEmptyDiagnosticsState,
  recordDiagnosticsEvent
} from "./diagnostics";

describe("p2p diagnostics", () => {
  it("records global and peer-local events", () => {
    const state = recordDiagnosticsEvent(createEmptyDiagnosticsState(), {
      peerId: "peer_a",
      channelKind: "data",
      direction: "sent",
      event: "offer",
      summary: "sent offer",
      now: "2026-04-01T00:00:00.000Z"
    });

    expect(state.recentEvents).toHaveLength(1);
    expect(state.peers.peer_a?.recentEvents).toHaveLength(1);
    expect(state.peers.peer_a?.recentEvents[0]).toMatchObject({
      event: "offer",
      direction: "sent"
    });
  });

  it("applies snapshot updates while recording an event", () => {
    const state = recordDiagnosticsEvent(createEmptyDiagnosticsState(), {
      peerId: "peer_a",
      channelKind: "data",
      direction: "local",
      event: "data-connected",
      summary: "data channel connected",
      now: "2026-04-01T00:00:00.000Z",
      update: (snapshot) => ({
        ...snapshot,
        dataConnectionState: "connected",
        dataChannelState: "open"
      })
    });

    expect(state.peers.peer_a?.dataConnectionState).toBe("connected");
    expect(state.peers.peer_a?.dataChannelState).toBe("open");
  });

  it("collapses consecutive duplicate diagnostics entries while keeping the latest snapshot", () => {
    let state = recordDiagnosticsEvent(createEmptyDiagnosticsState(), {
      peerId: "system",
      channelKind: "system",
      direction: "local",
      event: "segmented-status",
      summary: "分段 Opus 播放状态",
      now: "2026-04-01T00:00:00.000Z",
      update: (snapshot) => ({
        ...snapshot,
        segmentedPlaybackStatus: {
          playbackAssetId: "asset_1",
          mediaSessionKey: "session_1",
          sourcePeerId: "peer_a",
          isSourceOwner: true,
          listenerPlaybackState: "live",
          sourceStartState: "live",
          audioContextState: "running",
          outputTrackId: "track_1",
          remoteTrackId: null,
          bufferedAheadMs: 80_000,
          scheduledAheadMs: 100_000,
          underrunCount: 0,
          lastUnderrunAt: null,
          decodedPeak: 0.5,
          decodedRms: 0.1,
          lastDecodeError: null,
          mediaRecoveryState: null
        }
      })
    });

    state = recordDiagnosticsEvent(state, {
      peerId: "system",
      channelKind: "system",
      direction: "local",
      event: "segmented-status",
      summary: "分段 Opus 播放状态",
      now: "2026-04-01T00:00:05.000Z",
      update: (snapshot) => ({
        ...snapshot,
        segmentedPlaybackStatus: {
          playbackAssetId: "asset_1",
          mediaSessionKey: "session_1",
          sourcePeerId: "peer_a",
          isSourceOwner: true,
          listenerPlaybackState: "live",
          sourceStartState: "live",
          audioContextState: "running",
          outputTrackId: "track_1",
          remoteTrackId: null,
          bufferedAheadMs: 96_000,
          scheduledAheadMs: 120_000,
          underrunCount: 0,
          lastUnderrunAt: null,
          decodedPeak: 0.5,
          decodedRms: 0.1,
          lastDecodeError: null,
          mediaRecoveryState: null
        }
      })
    });

    expect(state.recentEvents).toHaveLength(1);
    expect(state.peers.system?.recentEvents).toHaveLength(1);
    expect(state.recentEvents[0]?.timestamp).toBe("2026-04-01T00:00:05.000Z");
    expect(state.peers.system?.segmentedPlaybackStatus?.bufferedAheadMs).toBe(96_000);
  });
});
