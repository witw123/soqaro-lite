import { describe, expect, it } from "vitest";
import type { LocalPlaylistTrackRecord } from "@/features/library/indexeddb";
import { toCachedProviderTrack } from "./local-playlist-mappers";

function record(overrides: Partial<LocalPlaylistTrackRecord>): LocalPlaylistTrackRecord {
  return {
    id: "local:hash-1",
    title: "Test Song",
    artist: "Artist",
    album: null,
    durationMs: 180_000,
    mimeType: "audio/mpeg",
    sizeBytes: 1024,
    artworkUrl: null,
    lyrics: null,
    provider: "netease",
    providerTrackId: null,
    fileHash: null,
    fileName: null,
    availableOffline: false,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    ...overrides
  };
}

describe("toCachedProviderTrack", () => {
  // Every provider the player can pull audio for on demand has to survive this
  // conversion. A missing one turns its rows into "需要下载后播放" - click-to-play
  // is disabled and the player reports that the track has no playable audio.
  it("rebuilds a provider track for every on-demand provider", () => {
    for (const provider of ["netease", "qqmusic", "bilibili"] as const) {
      expect(toCachedProviderTrack(record({ provider, providerTrackId: "id-1" }))).toMatchObject({
        provider,
        providerTrackId: "id-1",
        title: "Test Song"
      });
    }
  });

  it("returns nothing for local audio and for provider rows without a track id", () => {
    expect(toCachedProviderTrack(record({ provider: "local_upload" }))).toBeNull();
    expect(toCachedProviderTrack(record({ provider: "alist", providerTrackId: "id-1" }))).toBeNull();
    expect(toCachedProviderTrack(record({ provider: "bilibili", providerTrackId: null }))).toBeNull();
  });
});
