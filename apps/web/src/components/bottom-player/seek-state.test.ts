import { describe, expect, it } from "vitest";
import { shouldResolvePendingSeek, type PendingSeek } from "./seek-state";

const pendingSeek: PendingSeek = {
  requestId: 1,
  trackId: "track-1",
  targetPositionMs: 45_000,
  expectedPlaybackRevision: 8
};

describe("seek confirmation state", () => {
  it("waits for the server revision before releasing the local target", () => {
    expect(
      shouldResolvePendingSeek({
        pendingSeek,
        playback: {
          currentTrackId: "track-1",
          positionMs: 12_000,
          playbackRevision: 7
        }
      })
    ).toBe(false);
  });

  it("confirms a target position from the accepted playback snapshot", () => {
    expect(
      shouldResolvePendingSeek({
        pendingSeek,
        playback: {
          currentTrackId: "track-1",
          positionMs: 45_200,
          playbackRevision: 8
        }
      })
    ).toBe(true);
  });

  it("releases a target superseded by a newer playback revision", () => {
    expect(
      shouldResolvePendingSeek({
        pendingSeek,
        playback: {
          currentTrackId: "track-2",
          positionMs: 0,
          playbackRevision: 9
        }
      })
    ).toBe(true);
  });
});
