import { describe, expect, it } from "vitest";
import {
  synchronizeShuffleBagTrackIds,
  takeNextShuffleTrack
} from "./shuffle";

describe("shuffle bag synchronization", () => {
  it("randomly inserts newly queued tracks into the remaining cycle", () => {
    const bag = synchronizeShuffleBagTrackIds(
      ["old-track"],
      ["current", "old-track", "new-track"],
      "current",
      ["new-track"],
      () => 0
    );

    expect(bag).toEqual(["new-track", "old-track"]);
  });

  it("does not put already-played tracks back while a cycle remains", () => {
    const tracks = [
      { id: "played" },
      { id: "current" },
      { id: "remaining" },
      { id: "new-track" }
    ];
    const selection = takeNextShuffleTrack(
      tracks,
      ["new-track", "remaining"],
      "current",
      () => true,
      () => 0
    );

    expect(selection.track?.id).toBe("new-track");
    expect(selection.bag).toEqual(["remaining"]);
    expect(selection.bag).not.toContain("played");
  });
});
