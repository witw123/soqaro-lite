import { describe, expect, it } from "vitest";
import {
  classifyRoomPlaybackChange,
  resolvePlaybackSourceResetReason,
  resolvePlaybackSurfaceKey,
  resolvePlaybackTimelineKey
} from "./room-playback-topology";

const basePlayback = {
  status: "playing" as const,
  currentTrackId: "track_a",
  currentQueueItemId: "queue_a",
  startedAt: "2026-04-19T00:00:00.000Z",
  positionMs: 10_000,
  pauseRevision: 0,
  queueVersion: 4,
  mediaEpoch: 3,
  playbackRevision: 7,
  sourceSessionId: "member_1",
  sourcePeerId: "peer_member_1",
  sourceTrackId: "track_a"
};

describe("room-playback-topology", () => {
  it("keeps playback surface stable across queue-only noise", () => {
    expect(
      resolvePlaybackSurfaceKey({
        ...basePlayback,
        queueVersion: 4
      })
    ).toBe(
      resolvePlaybackSurfaceKey({
        ...basePlayback,
        queueVersion: 9,
        playbackRevision: 11,
        positionMs: 55_000
      })
    );
  });

  it("changes playback timeline key on seeks while keeping the same surface", () => {
    expect(
      resolvePlaybackSurfaceKey({
        ...basePlayback
      })
    ).toBe(
      resolvePlaybackSurfaceKey({
        ...basePlayback,
        playbackRevision: 9,
        positionMs: 45_000
      })
    );

    expect(
      resolvePlaybackTimelineKey({
        ...basePlayback
      })
    ).not.toBe(
      resolvePlaybackTimelineKey({
        ...basePlayback,
        playbackRevision: 9,
        startAt: "2026-04-19T00:00:45.000Z",
        startedAt: "2026-04-19T00:00:45.000Z",
        positionMs: 45_000
      })
    );

    expect(
      resolvePlaybackTimelineKey({
        ...basePlayback,
        playbackMode: "shuffle"
      })
    ).toBe(resolvePlaybackTimelineKey(basePlayback));
  });

  it("classifies presence and library patches without playback topology changes as non-topology events", () => {
    expect(
      classifyRoomPlaybackChange({
        eventKind: "presence",
        previousPlayback: basePlayback,
        nextPlayback: {
          ...basePlayback
        }
      })
    ).toBe("presence-only");

    expect(
      classifyRoomPlaybackChange({
        eventKind: "library",
        previousPlayback: basePlayback,
        nextPlayback: {
          ...basePlayback
        }
      })
    ).toBe("catalog-only");
  });

  it("classifies playback-order changes without resetting the timeline", () => {
    expect(
      classifyRoomPlaybackChange({
        eventKind: "playback",
        previousPlayback: basePlayback,
        nextPlayback: {
          ...basePlayback,
          playbackMode: "shuffle",
          playbackRevision: 8
        }
      })
    ).toBe("playback-control");
  });

  it("classifies media epoch changes as topology resets", () => {
    expect(
      classifyRoomPlaybackChange({
        eventKind: "playback",
        previousPlayback: basePlayback,
        nextPlayback: {
          ...basePlayback,
          mediaEpoch: 4
        }
      })
    ).toBe("playback-topology");
    expect(
      resolvePlaybackSourceResetReason({
        previousPlayback: basePlayback,
        nextPlayback: {
          ...basePlayback,
          mediaEpoch: 4
        }
      })
    ).toBe("media-epoch-changed");
  });
});
