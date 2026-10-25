import { describe, expect, it } from "vitest";
import {
  assetUnitId,
  removeCachedLibrarySourceReferences,
  toCachedLibraryTrackSummaryRecord
} from "./indexeddb";

describe("assetUnitId", () => {
  it("uses content asset identity and rejects invalid indexes", () => {
    expect(assetUnitId("a".repeat(64), 7)).toBe(`${"a".repeat(64)}:7`);
    expect(() => assetUnitId("", 0)).toThrow();
    expect(() => assetUnitId("a".repeat(64), -1)).toThrow();
  });
});

describe("toCachedLibraryTrackSummaryRecord", () => {
  it("strips the audio blob from cached-library list records", () => {
    const summary = toCachedLibraryTrackSummaryRecord({
      fileHash: "hash_1",
      title: "Track",
      artist: "Artist",
      mimeType: "audio/flac",
      durationMs: 120_000,
      sizeBytes: 48_000_000,
      file: new Blob(["audio"], { type: "audio/flac" }),
      cachedAt: "2026-07-04T00:00:00.000Z",
      sourceTrackIds: ["track_1"],
      sourceRoomIds: ["room_1"],
      lastSourceTrackId: "track_1",
      lastSourceRoomId: "room_1",
      lastOwnerNickname: "Host"
    });

    expect(summary).not.toHaveProperty("file");
    expect(summary).toMatchObject({
      fileHash: "hash_1",
      title: "Track",
      sizeBytes: 48_000_000,
      sourceTrackIds: ["track_1"]
    });
  });
});

describe("removeCachedLibrarySourceReferences", () => {
  it("marks a cache entry unreferenced when its final track is deleted", () => {
    expect(removeCachedLibrarySourceReferences({
      sourceTrackIds: ["track_1"],
      sourceRoomIds: ["room_1"],
      lastSourceTrackId: "track_1",
      lastSourceRoomId: "room_1",
      lastOwnerNickname: "Host"
    }, ["track_1"])).toEqual({
      sourceTrackIds: [],
      sourceRoomIds: [],
      lastSourceTrackId: null,
      lastSourceRoomId: null,
      lastOwnerNickname: null,
      isUnreferenced: true
    });
  });

  it("keeps a shared file while another uploaded track still references it", () => {
    expect(removeCachedLibrarySourceReferences({
      sourceTrackIds: ["track_1", "track_2"],
      sourceRoomIds: ["room_1", "room_2"],
      lastSourceTrackId: "track_2",
      lastSourceRoomId: "room_2",
      lastOwnerNickname: "Host"
    }, ["track_2"])).toEqual({
      sourceTrackIds: ["track_1"],
      sourceRoomIds: ["room_1"],
      lastSourceTrackId: "track_1",
      lastSourceRoomId: null,
      lastOwnerNickname: null,
      isUnreferenced: false
    });
  });

  it("removes only the deleted room reference when a file is shared across rooms", () => {
    expect(removeCachedLibrarySourceReferences({
      sourceTrackIds: ["track_1", "track_2"],
      sourceRoomIds: ["room_1", "room_2"],
      lastSourceTrackId: "track_2",
      lastSourceRoomId: "room_2",
      lastOwnerNickname: "Host"
    }, ["track_1"], "room_1")).toMatchObject({
      sourceTrackIds: ["track_2"],
      sourceRoomIds: ["room_2"],
      lastSourceTrackId: "track_2",
      lastSourceRoomId: "room_2",
      isUnreferenced: false
    });
  });
});
