import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const indexedDbMocks = vi.hoisted(() => ({
  deleteCachedLibraryTrack: vi.fn(),
  deleteCachedLibraryTrackFile: vi.fn(),
  getCachedLibraryTrack: vi.fn(),
  getCachedLibraryTrackSummary: vi.fn(),
  getLocalAudioCacheFileRecord: vi.fn(),
  getLocalAudioFileRecord: vi.fn(),
  listCachedLibraryTrackSummaries: vi.fn(),
  listLocalAudioCacheFiles: vi.fn(),
  listLocalAudioFiles: vi.fn(),
  upsertCachedLibraryTrack: vi.fn(),
  updateCachedLibraryTrackMetadata: vi.fn()
}));

const storageMocks = vi.hoisted(() => ({
  normalizeLocalAudioMimeType: vi.fn((value: string) => value || "audio/mpeg"),
  saveCachedAudioFileToLocalDirectory: vi.fn()
}));

const playlistMocks = vi.hoisted(() => ({
  hashAudioBlob: vi.fn().mockResolvedValue("hash_1"),
  localPlaylistTrackId: vi.fn((track: { provider: string; providerTrackId: string }) =>
    `${track.provider}:${track.providerTrackId}`
  ),
  toProviderTrackRecord: vi.fn((track: {
    provider: string;
    providerTrackId: string;
    title: string;
    artist: string;
    album: string | null;
    durationMs: number;
    artworkUrl: string | null;
  }) => ({
    id: `${track.provider}:${track.providerTrackId}`,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    artworkUrl: track.artworkUrl,
    fileHash: null,
    fileName: null,
    mimeType: "audio/mpeg",
    sizeBytes: 0,
    availableOffline: false,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z"
  }))
}));

const apiMocks = vi.hoisted(() => ({
  soqaroApi: {
    downloadNeteaseTrack: vi.fn(),
    downloadQqMusicTrack: vi.fn(),
    getNeteaseLyrics: vi.fn(),
    getQqMusicLyrics: vi.fn()
  }
}));
const metadataMocks = vi.hoisted(() => ({
  resolveLocalArtworkUrl: vi.fn().mockResolvedValue(null)
}));
const loudnessMocks = vi.hoisted(() => ({
  analyzeAudioBlobLoudness: vi.fn().mockResolvedValue(null)
}));

vi.mock("@/features/library/audio-metadata", () => metadataMocks);
vi.mock("./loudness", () => loudnessMocks);
vi.mock("@/features/library/indexeddb", () => indexedDbMocks);
vi.mock("@/features/library/local-audio-storage", () => storageMocks);
vi.mock("@/features/playlist/local-playlist", () => playlistMocks);
vi.mock("@/lib/network/soqaro-api", () => apiMocks);

import type { ProviderTrack } from "@/features/playlist/local-playlist";
import {
  cacheProviderTrackForPlayback,
  cleanupProviderTrackPlaybackCache,
  hasProviderTrackPlaybackCache,
  releaseProviderTrackPlaybackCache
} from "./provider-track-cache";

function buildTrack(provider: "netease" | "qqmusic"): ProviderTrack {
  return {
    provider,
    providerTrackId: provider === "netease" ? "123" : "qq_song",
    access: "unknown",
    quality: null,
    title: "Song",
    artist: "Artist",
    album: "Album",
    durationMs: 1_000,
    artworkUrl: null
  };
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    fileHash: "hash_1",
    title: "Song",
    artist: "Artist",
    album: "Album",
    artworkUrl: null,
    lyrics: null,
    provider: "netease" as const,
    providerTrackId: "123",
    mimeType: "audio/mpeg",
    durationMs: 1_000,
    sizeBytes: 5,
    cachedAt: "2026-07-24T00:00:00.000Z",
    sourceTrackIds: [],
    sourceRoomIds: [],
    lastSourceTrackId: null,
    lastSourceRoomId: null,
    lastOwnerNickname: null,
    ...overrides
  };
}

describe("provider playback cache lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    indexedDbMocks.getCachedLibraryTrack.mockResolvedValue(null);
    indexedDbMocks.getCachedLibraryTrackSummary.mockResolvedValue(null);
    indexedDbMocks.getLocalAudioCacheFileRecord.mockResolvedValue(null);
    indexedDbMocks.getLocalAudioFileRecord.mockResolvedValue(null);
    indexedDbMocks.listCachedLibraryTrackSummaries.mockResolvedValue([]);
    indexedDbMocks.listLocalAudioCacheFiles.mockResolvedValue([]);
    indexedDbMocks.listLocalAudioFiles.mockResolvedValue([]);
    storageMocks.saveCachedAudioFileToLocalDirectory.mockResolvedValue(null);
    apiMocks.soqaroApi.getNeteaseLyrics.mockResolvedValue({ plainLyric: null });
    apiMocks.soqaroApi.getQqMusicLyrics.mockResolvedValue({ plainLyric: null });
    apiMocks.soqaroApi.downloadNeteaseTrack.mockResolvedValue({
      blob: new Blob(["audio"], { type: "audio/mpeg" }),
      contentType: "audio/mpeg"
    });
    apiMocks.soqaroApi.downloadQqMusicTrack.mockResolvedValue({
      blob: new Blob(["audio"], { type: "audio/mpeg" }),
      contentType: "audio/mpeg"
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    ["netease", "downloadNeteaseTrack"],
    ["qqmusic", "downloadQqMusicTrack"]
  ] as const)("downloads %s into the browser cache before playback", async (provider, method) => {
    await cacheProviderTrackForPlayback(buildTrack(provider));

    expect(apiMocks.soqaroApi[method]).toHaveBeenCalledOnce();
    expect(indexedDbMocks.upsertCachedLibraryTrack).toHaveBeenCalledOnce();
    expect(storageMocks.saveCachedAudioFileToLocalDirectory).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(storageMocks.saveCachedAudioFileToLocalDirectory).toHaveBeenCalledOnce();
  });

  it("returns playable audio while directory synchronization is still pending", async () => {
    let finishCopy!: (value: null) => void;
    storageMocks.saveCachedAudioFileToLocalDirectory.mockImplementationOnce(
      () => new Promise((resolve) => { finishCopy = resolve; })
    );
    const record = await cacheProviderTrackForPlayback(buildTrack("netease"));
    expect(record.fileHash).toBe("hash_1");
    expect(record.fileName).toBeNull();
    expect(metadataMocks.resolveLocalArtworkUrl).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(storageMocks.saveCachedAudioFileToLocalDirectory).toHaveBeenCalledOnce();
    expect(indexedDbMocks.upsertCachedLibraryTrack).toHaveBeenCalledOnce();
    expect(indexedDbMocks.updateCachedLibraryTrackMetadata).toHaveBeenCalledOnce();
    finishCopy(null);
  });

  it("passes cancellation into the download and does not persist cancelled audio", async () => {
    const controller = new AbortController();
    apiMocks.soqaroApi.downloadNeteaseTrack.mockImplementationOnce(
      async (_id, _quality, signal: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        controller.abort();
        throw signal.reason;
      }
    );
    await expect(cacheProviderTrackForPlayback(buildTrack("netease"), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(indexedDbMocks.upsertCachedLibraryTrack).not.toHaveBeenCalled();
  });

  it("removes only the browser copy when a local cache exists", async () => {
    const summary = buildSummary();
    indexedDbMocks.getCachedLibraryTrack.mockResolvedValue({ ...summary, file: new Blob(["audio"]) });
    indexedDbMocks.getCachedLibraryTrackSummary.mockResolvedValue(summary);
    indexedDbMocks.getLocalAudioCacheFileRecord.mockResolvedValue({
      fileHash: "hash_1",
      fileName: "Song [hash_1].mp3"
    });

    await releaseProviderTrackPlaybackCache("hash_1");

    expect(indexedDbMocks.deleteCachedLibraryTrackFile).toHaveBeenCalledWith("hash_1");
    expect(indexedDbMocks.deleteCachedLibraryTrack).not.toHaveBeenCalled();
  });

  it("keeps a local cache through page cleanup and clears its browser copy", async () => {
    const summary = buildSummary();
    indexedDbMocks.listCachedLibraryTrackSummaries.mockResolvedValue([summary]);
    indexedDbMocks.listLocalAudioCacheFiles.mockResolvedValue([{ fileHash: "hash_1" }]);
    indexedDbMocks.getCachedLibraryTrack.mockResolvedValue({ ...summary, file: new Blob(["audio"]) });

    await cleanupProviderTrackPlaybackCache();

    expect(indexedDbMocks.deleteCachedLibraryTrackFile).toHaveBeenCalledWith("hash_1");
    expect(indexedDbMocks.deleteCachedLibraryTrack).not.toHaveBeenCalled();
  });

  it("reuses a retained local cache instead of downloading again", async () => {
    const summary = buildSummary();
    indexedDbMocks.listCachedLibraryTrackSummaries.mockResolvedValue([summary]);
    indexedDbMocks.getLocalAudioCacheFileRecord.mockResolvedValue({
      fileHash: "hash_1",
      fileName: "Song [hash_1].mp3"
    });

    const record = await cacheProviderTrackForPlayback(buildTrack("netease"));

    expect(record.fileHash).toBe("hash_1");
    expect(record.fileName).toBe("Song [hash_1].mp3");
    expect(apiMocks.soqaroApi.downloadNeteaseTrack).not.toHaveBeenCalled();
    await expect(hasProviderTrackPlaybackCache("hash_1")).resolves.toBe(true);
  });

  it("keeps cached loudness metadata when reusing a provider track", async () => {
    const summary = buildSummary({
      loudness: {
        integratedLufs: -18,
        truePeakDbtp: -2,
        gainDb: 4,
        targetLufs: -14,
        version: 1
      }
    });
    indexedDbMocks.listCachedLibraryTrackSummaries.mockResolvedValue([summary]);
    indexedDbMocks.getLocalAudioCacheFileRecord.mockResolvedValue({
      fileHash: "hash_1",
      fileName: "Song [hash_1].mp3"
    });

    const record = await cacheProviderTrackForPlayback(buildTrack("netease"));

    expect(record.loudness?.gainDb).toBe(4);
  });
});
