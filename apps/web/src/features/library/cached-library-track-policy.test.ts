import { describe, expect, it } from "vitest";
import { isCachedLibraryTrackUsableForRoomTrack } from "./cached-library-track-policy";

const roomTrack = {
  id: "track_current",
  fileHash: "hash_current",
  durationMs: 277_000,
  sizeBytes: 12_345_678
};

describe("isCachedLibraryTrackUsableForRoomTrack", () => {
  it("accepts a cached file explicitly assembled for the current room track", () => {
    expect(
      isCachedLibraryTrackUsableForRoomTrack({
        cachedTrack: {
          fileHash: "hash_current",
          sourceTrackIds: ["track_current"],
          lastSourceTrackId: "track_current",
          durationMs: 100,
          sizeBytes: 1
        },
        roomTrack
      })
    ).toBe(true);
  });

  it("accepts a same-hash cached file only when file metadata also matches", () => {
    expect(
      isCachedLibraryTrackUsableForRoomTrack({
        cachedTrack: {
          fileHash: "hash_current",
          sourceTrackIds: ["track_other"],
          lastSourceTrackId: "track_other",
          durationMs: 277_500,
          sizeBytes: 12_345_678
        },
        roomTrack
      })
    ).toBe(true);
  });

  it("rejects stale same-hash personal library metadata", () => {
    expect(
      isCachedLibraryTrackUsableForRoomTrack({
        cachedTrack: {
          fileHash: "hash_current",
          sourceTrackIds: ["track_other"],
          lastSourceTrackId: "track_other",
          durationMs: 312_000,
          sizeBytes: 99_999
        },
        roomTrack
      })
    ).toBe(false);
  });
});
