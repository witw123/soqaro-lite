import { describe, expect, it } from "vitest";
import { getNextPlaybackMode, takeNextShuffleTrack } from "./playback-mode";

describe("getNextPlaybackMode", () => {
  it("cycles through sequence, shuffle, and single-track repeat", () => {
    expect(getNextPlaybackMode("sequence")).toBe("shuffle");
    expect(getNextPlaybackMode("shuffle")).toBe("single");
    expect(getNextPlaybackMode("single")).toBe("sequence");
  });
});

describe("takeNextShuffleTrack", () => {
  const tracks = [{ id: "track-a" }, { id: "track-b" }, { id: "track-c" }];
  const playable = () => true;
  type ShuffleResult = { track: { id: string } | null; bag: string[] };

  it("plays every track once before starting a new cycle", () => {
    let bag: string[] = [];
    let currentTrackId: string | null = null;
    const played: string[] = [];

    for (let index = 0; index < tracks.length; index += 1) {
      const result: ShuffleResult = takeNextShuffleTrack(
        tracks,
        bag,
        currentTrackId,
        playable,
        () => 0
      );
      expect(result.track).not.toBeNull();
      played.push(result.track!.id);
      bag = result.bag;
      currentTrackId = result.track!.id;
    }

    expect(new Set(played).size).toBe(tracks.length);

    const next: ShuffleResult = takeNextShuffleTrack(tracks, bag, currentTrackId, playable, () => 0);
    expect(next.track?.id).not.toBe(currentTrackId);
  });

  it("removes tracks that no longer exist in the queue", () => {
    const result: ShuffleResult = takeNextShuffleTrack(
      tracks,
      ["track-a", "removed-track", "track-b"],
      "track-c",
      playable,
      () => 0
    );

    expect(result.track?.id).not.toBe("removed-track");
    expect(result.bag).not.toContain("removed-track");
  });

  it("repeats a one-track queue without creating a dead end", () => {
    const onlyTrack = [{ id: "only-track" }];
    const result: ShuffleResult = takeNextShuffleTrack(
      onlyTrack,
      [],
      "only-track",
      playable,
      () => 0
    );

    expect(result.track?.id).toBe("only-track");
    expect(result.bag).toEqual([]);
  });
});
