import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTracks } = vi.hoisted(() => ({
  mockTracks: [
    {
      id: "track-1",
      fileHash: "hash-1",
      provider: "netease",
      providerTrackId: "12345",
      title: "Test Song 1",
      artist: "Artist 1",
      artworkUrl: "https://example.com/cover1.jpg",
      lyrics: "[00:00.00]Hello world",
      durationMs: 180000,
      available: true
    }
  ]
}));

vi.mock("@/features/library/indexeddb", () => ({
  listLocalPlaylistTracks: vi.fn().mockResolvedValue(mockTracks),
  listCachedLibraryTrackSummaries: vi.fn().mockResolvedValue([]),
  listCachedLibraryTrackHashes: vi.fn().mockResolvedValue(["hash-1"]),
  listLocalAudioFiles: vi.fn().mockResolvedValue([]),
  listLocalAudioCacheFiles: vi.fn().mockResolvedValue([])
}));

vi.mock("@/features/library/local-audio-storage", () => ({
  getConfiguredLocalRepository: vi.fn().mockResolvedValue(null)
}));

import {
  findRoomPlaylistTrackRecord,
  invalidateRoomPlaylistTrackIndex,
  listRoomPlaylistTrackIndex
} from "./local-playlist";

describe("findRoomPlaylistTrackRecord and multi-key index", () => {
  beforeEach(() => {
    invalidateRoomPlaylistTrackIndex();
  });

  it("finds a track by trackId in O(1)", async () => {
    const record = await findRoomPlaylistTrackRecord({ trackId: "track-1" });
    expect(record).not.toBeNull();
    expect(record?.id).toBe("track-1");
    expect(record?.title).toBe("Test Song 1");
    expect(record?.artworkUrl).toBe("https://example.com/cover1.jpg");
  });

  it("finds a track by provider and providerTrackId", async () => {
    const record = await findRoomPlaylistTrackRecord({
      provider: "netease",
      providerTrackId: "12345"
    });
    expect(record).not.toBeNull();
    expect(record?.id).toBe("track-1");
  });

  it("finds a track by fileHash", async () => {
    const record = await findRoomPlaylistTrackRecord({ fileHash: "hash-1" });
    expect(record).not.toBeNull();
    expect(record?.id).toBe("track-1");
  });

  it("returns null when not found", async () => {
    const record = await findRoomPlaylistTrackRecord({ trackId: "non-existent" });
    expect(record).toBeNull();
  });

  it("reuses the cached index for listRoomPlaylistTrackIndex", async () => {
    const map1 = await listRoomPlaylistTrackIndex();
    const map2 = await listRoomPlaylistTrackIndex();
    expect(map1).toBe(map2);
    expect(map1.get("track-1")?.title).toBe("Test Song 1");
  });
});
