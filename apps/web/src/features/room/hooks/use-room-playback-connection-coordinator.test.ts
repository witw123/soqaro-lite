import { describe, expect, it } from "vitest";
import {
  resolvePlaybackConnectionKey,
  resolvePlaybackRecoveryConnectionContext,
  resolvePlaybackRecoveryActionType,
  resolvePlaybackRecoveryDropReason
} from "./use-room-playback-connection-coordinator";

describe("resolvePlaybackConnectionKey", () => {
  it("uses the room media epoch as the playback connection identity", () => {
    expect(
      resolvePlaybackConnectionKey({
        roomId: "room_1",
        sourcePeerId: "peer_source",
        mediaEpoch: 7,
        transportEpoch: 2
      })
    ).toBe("room_1|peer_source|7");
  });
});

describe("resolvePlaybackRecoveryActionType", () => {
  it("maps data recommendations to data peer restart", () => {
    expect(
      resolvePlaybackRecoveryActionType({
        playbackConnectionKey: "room_1|peer_source|7",
        peerId: "peer_source",
        scope: "data",
        level: "hard-recreate",
        reason: "watchdog-data-stalled",
        observedNoProgressMs: 5_000
      })
    ).toBe("restart-data-peer");
  });

  it("maps room recommendations to full resubscribe", () => {
    expect(
      resolvePlaybackRecoveryActionType({
        playbackConnectionKey: "room_1|peer_source|7",
        peerId: null,
        scope: "room",
        level: "full-resubscribe",
        reason: "watchdog-room-stalled",
        observedNoProgressMs: 45_000
      })
    ).toBe("full-resubscribe");
  });
});

describe("resolvePlaybackRecoveryConnectionContext", () => {
  it("adopts the current playback generation before running recovery", () => {
    expect(
      resolvePlaybackRecoveryConnectionContext({
        trackedPlaybackConnectionKey: null,
        currentPlaybackConnectionKey: "room_1|peer_source|7",
        recommendationPlaybackConnectionKey: null
      })
    ).toEqual({
      activePlaybackConnectionKey: "room_1|peer_source|7",
      recoveryPlaybackConnectionKey: "room_1|peer_source|7",
      shouldResetRecoveryState: true
    });
  });

  it("keeps an explicitly stale recommendation stale after adopting the current generation", () => {
    expect(
      resolvePlaybackRecoveryConnectionContext({
        trackedPlaybackConnectionKey: "room_1|peer_source|6",
        currentPlaybackConnectionKey: "room_1|peer_source|7",
        recommendationPlaybackConnectionKey: "room_1|peer_source|6"
      })
    ).toEqual({
      activePlaybackConnectionKey: "room_1|peer_source|7",
      recoveryPlaybackConnectionKey: "room_1|peer_source|6",
      shouldResetRecoveryState: true
    });
  });
});

describe("resolvePlaybackRecoveryDropReason", () => {
  it("drops recovery actions that target a stale playback connection key", () => {
    expect(
      resolvePlaybackRecoveryDropReason({
        playbackConnectionKey: "room_1|peer_source|6",
        currentPlaybackConnectionKey: "room_1|peer_source|7",
        activeAction: null,
        nextActionType: "restart-data-peer",
        now: Date.parse("2026-04-14T00:00:00.000Z")
      })
    ).toBe("stale-connection-key");
  });

  it("drops lower-priority actions while a higher-priority action is still running", () => {
    expect(
      resolvePlaybackRecoveryDropReason({
        playbackConnectionKey: "room_1|peer_source|7",
        currentPlaybackConnectionKey: "room_1|peer_source|7",
        activeAction: {
          actionId: "recovery_1",
          playbackConnectionKey: "room_1|peer_source|7",
          actionType: "full-resubscribe",
          peerId: null,
          startedAt: "2026-04-14T00:00:00.000Z",
          expiresAt: "2026-04-14T00:00:08.000Z",
          result: "running",
          reason: "watchdog-room-stalled"
        },
        nextActionType: "restart-data-peer",
        now: Date.parse("2026-04-14T00:00:01.000Z")
      })
    ).toBe("lower-priority-running");
  });
});
