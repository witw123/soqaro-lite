import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot } from "@soqaro/shared";
import {
  createPlaybackStartRequest,
  doesPlaybackMatchStartRequest,
  failPlaybackStartRequest,
  satisfyPlaybackStartRequest
} from "./playback-start-request";

const playback = {
  status: "playing",
  currentTrackId: "track_1",
  currentQueueItemId: "queue_1",
  queueVersion: 4,
  playbackRevision: 4,
  mediaEpoch: 2,
  positionMs: 0
} as PlaybackSnapshot;

describe("playback start request", () => {
  it("matches the requested revision without a source selection", () => {
    const request = createPlaybackStartRequest({
      reason: "user-play",
      trackId: "track_1",
      targetPlaybackRevision: 4,
      now: 100
    });
    expect(doesPlaybackMatchStartRequest(request, playback, 200)).toBe(true);
    expect(satisfyPlaybackStartRequest(request, 300).state).toBe("satisfied");
  });

  it("records a failed request without selecting a fallback source", () => {
    const request = createPlaybackStartRequest({
      reason: "room-resync",
      targetPlaybackRevision: 5,
      now: 100
    });
    expect(failPlaybackStartRequest(request, "decode-failed")).toMatchObject({
      state: "failed",
      failureReason: "decode-failed"
    });
  });
});
