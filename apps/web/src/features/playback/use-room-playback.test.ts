import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlaybackEffectivePositionMs,
  resolveDisplayRoomPositionMs,
  resolveAudibleClockSample,
  resolveAudibleClockContinuitySample,
  resolveDisplayClockProgress,
  type DisplayClockSource
} from "./use-room-playback";
import {
  calibrateRoomPlaybackClock,
  resetRoomPlaybackClockForTests
} from "./room-playback-clock";

afterEach(() => resetRoomPlaybackClockForTests());

describe("getPlaybackEffectivePositionMs", () => {
  it("uses the calibrated room clock for synchronized lyric progress", () => {
    resetRoomPlaybackClockForTests();
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-10T00:00:02.000Z"));
    expect(calibrateRoomPlaybackClock({
      serverNow: "2026-07-10T00:00:01.050Z",
      requestStartedAtMs: Date.parse("2026-07-10T00:00:00.000Z"),
      responseReceivedAtMs: Date.parse("2026-07-10T00:00:00.100Z")
    })).toBe(true);

    try {
      expect(getPlaybackEffectivePositionMs({
        status: "playing",
        currentTrackId: "track_1",
        currentQueueItemId: null,
        playbackAssetId: null,
        startAt: "2026-07-10T00:00:00.000Z",
        sourceSessionId: null,
        sourcePeerId: null,
        sourceTrackId: "track_1",
        positionMs: 4_000,
        startedAt: "2026-07-10T00:00:01.000Z",
        queueVersion: 1,
        playbackRevision: 1,
        mediaEpoch: 1,
        playbackMode: "sequence"
      }, 120_000)).toBe(6_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes and resumes from the shared cache barrier anchor", () => {
    const playback = {
      status: "playing" as const,
      currentTrackId: "track_1",
      positionMs: 4_000,
      startedAt: "2026-07-10T00:00:01.000Z",
      startAt: "2026-07-10T00:00:01.000Z"
    } as never;
    expect(getPlaybackEffectivePositionMs(
      playback,
      120_000,
      Date.parse("2026-07-10T00:01:00.000Z"),
      { holdPositionMs: 18_000, resumeAtMs: null }
    )).toBe(18_000);
    expect(getPlaybackEffectivePositionMs(
      playback,
      120_000,
      Date.parse("2026-07-10T00:00:16.000Z"),
      { holdPositionMs: 18_000, resumeAtMs: Date.parse("2026-07-10T00:00:15.000Z") }
    )).toBe(19_000);
  });

  it("resets the progress display to the track start while a barrier is blocked without an anchor", () => {
    const playback = {
      status: "playing" as const,
      currentTrackId: "track_1",
      mediaEpoch: 2,
      positionMs: 4_000,
      startedAt: "2026-07-10T00:00:01.000Z",
      startAt: "2026-07-10T00:00:01.000Z"
    } as never;
    expect(resolveDisplayRoomPositionMs({
      playback,
      durationMs: 120_000,
      nowMs: Date.parse("2026-07-10T00:01:00.000Z"),
      barrier: { blocked: true, holdPositionMs: null, resumeAtMs: null },
      previousProgressMs: 18_000,
      previousSessionKey: "track_1|2|2026-07-10T00:00:01.000Z|playing"
    })).toBe(0);
  });
});

describe("resolveAudibleClockSample", () => {
  it("uses the local audio clock while local playback is audible", () => {
    expect(
      resolveAudibleClockSample({
        localAudioCurrentTimeSeconds: 42.25,
        localAudioPaused: false
      })
    ).toEqual({
      sample: {
        progressMs: 42_250,
        source: "local-audible"
      }
    });
  });

  it("prefers the local playback position once local playback is audible", () => {
    expect(
      resolveAudibleClockSample({
        localPlaybackPositionMs: 18_420,
        localAudioCurrentTimeSeconds: 15,
        localAudioPaused: false
      })
    ).toEqual({
      sample: {
        progressMs: 18_420,
        source: "local-audible"
      }
    });
  });

  it("returns no audible sample when the local element is paused and no runtime position is available", () => {
    expect(
      resolveAudibleClockSample({
        localAudioCurrentTimeSeconds: 42.25,
        localAudioPaused: true,
        localPlaybackPositionMs: null
      })
    ).toEqual({ sample: null });
  });
});

describe("resolveDisplayClockProgress", () => {
  const remoteSource: DisplayClockSource = "local-audible";

  it("keeps the display clock glued to the audible clock for small drift", () => {
    const result = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_120,
        source: remoteSource
      },
      roomClockMs: 20_180,
      durationMs: 240_000,
      previousDisplayMs: 20_000,
      previousSource: remoteSource,
      transitionState: {
        source: remoteSource,
        anchorDisplayMs: 20_000,
        anchorAudibleMs: 20_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 1_120
    });

    expect(result.progressMs).toBe(20_120);
    expect(result.source).toBe("local-audible");
    expect(result.displayDriftMs).toBe(60);
  });

  it("keeps local audible playback glued to the audible clock under moderate room drift", () => {
    const result = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_000,
        source: "local-audible"
      },
      roomClockMs: 20_240,
      durationMs: 240_000,
      previousDisplayMs: 20_000,
      previousSource: "local-audible",
      transitionState: {
        source: "local-audible",
        anchorDisplayMs: 20_000,
        anchorAudibleMs: 20_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 1_120
    });

    expect(result.progressMs).toBe(20_000);
    expect(result.source).toBe("local-audible");
  });

  it("keeps remote audible playback monotonic under moderate room drift", () => {
    const result = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_000,
        source: remoteSource
      },
      roomClockMs: 20_240,
      durationMs: 240_000,
      previousDisplayMs: 20_000,
      previousSource: remoteSource,
      transitionState: {
        source: remoteSource,
        anchorDisplayMs: 20_000,
        anchorAudibleMs: 20_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 1_120
    });

    expect(result.progressMs).toBe(20_000);
    expect(result.source).toBe("local-audible");
  });

  it("prefers the remote audible clock over the room fallback clock", () => {
    const result = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_000,
        source: remoteSource
      },
      roomClockMs: 20_240,
      durationMs: 240_000,
      previousDisplayMs: 20_000,
      previousSource: remoteSource,
      transitionState: {
        source: remoteSource,
        anchorDisplayMs: 20_000,
        anchorAudibleMs: 20_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 1_200
    });

    expect(result.progressMs).toBe(20_000);
    expect(result.source).toBe("local-audible");
  });

  it("keeps following the audible clock even under severe room-clock drift", () => {
    const firstFrame = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_000,
        source: remoteSource
      },
      roomClockMs: 21_800,
      durationMs: 240_000,
      previousDisplayMs: 20_000,
      previousSource: remoteSource,
      transitionState: {
        source: remoteSource,
        anchorDisplayMs: 20_000,
        anchorAudibleMs: 20_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 1_120
    });

    const secondFrame = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 20_120,
        source: remoteSource
      },
      roomClockMs: 21_920,
      durationMs: 240_000,
      previousDisplayMs: firstFrame.progressMs,
      previousSource: firstFrame.source,
      transitionState: firstFrame.transitionState,
      now: 1_240
    });

    expect(firstFrame.progressMs).toBe(20_000);
    expect(secondFrame.progressMs).toBe(20_120);
    expect(secondFrame.displayDriftMs).toBe(1_800);
  });

  it("keeps source switches continuous before converging to the new audible clock", () => {
    const firstFrame = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 15_600,
        source: "local-audible"
      },
      roomClockMs: 15_620,
      durationMs: 240_000,
      previousDisplayMs: 15_000,
      previousSource: "local-audible",
      transitionState: {
        source: "local-audible",
        anchorDisplayMs: 15_000,
        anchorAudibleMs: 15_000,
        anchorAtMs: 2_000,
        hardDriftSamples: 0
      },
      now: 2_000
    });

    const settledFrame = resolveDisplayClockProgress({
      audibleClockSample: {
        progressMs: 15_600,
        source: "local-audible"
      },
      roomClockMs: 15_620,
      durationMs: 240_000,
      previousDisplayMs: firstFrame.progressMs,
      previousSource: firstFrame.source,
      transitionState: firstFrame.transitionState,
      now: 2_400
    });

    expect(firstFrame.progressMs).toBe(15_600);
    expect(settledFrame.progressMs).toBe(15_600);
    expect(settledFrame.source).toBe("local-audible");
  });

  it("falls back to the room clock when no audible clock is available", () => {
    const result = resolveDisplayClockProgress({
      audibleClockSample: null,
      roomClockMs: 33_000,
      durationMs: 240_000,
      previousDisplayMs: 32_500,
      previousSource: "local-audible",
      transitionState: {
        source: "local-audible",
        anchorDisplayMs: 32_500,
        anchorAudibleMs: 32_500,
        anchorAtMs: 3_000,
        hardDriftSamples: 0
      },
      now: 3_100
    });

    expect(result.progressMs).toBe(32_500);
    expect(result.source).toBe("room-fallback");
    expect(result.displayDriftMs).toBe(500);
  });
});

describe("resolveAudibleClockContinuitySample", () => {
  it("retains the last audible anchor during short remote clock gaps", () => {
    const previousContinuity = {
      sample: {
        progressMs: 42_000,
        source: "local-audible" as const
      },
      observedAtMs: 1_000,
      sessionKey: "track-a|1|1|started|playing"
    };

    const result = resolveAudibleClockContinuitySample({
      audibleClockSample: null,
      previousContinuity,
      playbackSessionKey: "track-a|1|1|started|playing",
      playbackStatus: "playing",
      now: 1_600
    });

    expect(result.sample).toBeNull();
    expect(result.continuityState).toBe(previousContinuity);
  });

  it("keeps continuity metadata long enough to avoid falling back immediately", () => {
    const previousContinuity = {
      sample: {
        progressMs: 42_000,
        source: "local-audible" as const
      },
      observedAtMs: 1_000,
      sessionKey: "track-a|1|1|started|playing"
    };

    const result = resolveDisplayClockProgress({
      audibleClockSample: null,
      previousContinuity,
      playbackStatus: "playing",
      roomClockMs: 48_000,
      durationMs: 240_000,
      previousDisplayMs: 42_000,
      previousSource: "local-audible",
      transitionState: {
        source: "local-audible",
        anchorDisplayMs: 42_000,
        anchorAudibleMs: 42_000,
        anchorAtMs: 1_000,
        hardDriftSamples: 0
      },
      now: 2_200
    });

    expect(result.progressMs).toBe(42_000);
    expect(result.source).toBe("local-audible");
  });

  it("keeps continuity metadata while playback is still active", () => {
    const previousContinuity = {
      sample: {
        progressMs: 42_000,
        source: "local-audible" as const
      },
      observedAtMs: 1_000,
      sessionKey: "track-a|1|1|started|playing"
    };

    const result = resolveAudibleClockContinuitySample({
      audibleClockSample: null,
      previousContinuity,
      playbackSessionKey: "track-a|1|1|started|playing",
      playbackStatus: "playing",
      now: 4_500
    });

    expect(result.sample).toBeNull();
    expect(result.continuityState).toBe(previousContinuity);
  });

  it("drops continuity when a seek creates a new playback session", () => {
    const previousContinuity = {
      sample: {
        progressMs: 42_000,
        source: "local-audible" as const
      },
      observedAtMs: 1_000,
      sessionKey: "track-a|1|1|old-start|playing"
    };

    const result = resolveAudibleClockContinuitySample({
      audibleClockSample: null,
      previousContinuity,
      playbackSessionKey: "track-a|1|2|new-start|playing",
      playbackStatus: "playing",
      now: 1_050
    });

    expect(result.sample).toBeNull();
    expect(result.continuityState).toBeNull();
  });
});
