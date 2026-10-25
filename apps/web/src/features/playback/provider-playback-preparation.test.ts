import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderTrack } from "@/features/playlist/local-playlist";
const cache = vi.hoisted(() => ({
  cacheProviderTrackForPlayback: vi.fn(),
  findCachedProviderPlaybackRecord: vi.fn().mockResolvedValue(null),
  hasProviderTrackPlaybackCache: vi.fn().mockResolvedValue(false)
}));
vi.mock("./provider-track-cache", () => cache);
vi.mock("@/features/library/indexeddb", () => ({
  getLocalAudioFileRecord: vi.fn().mockResolvedValue(null),
  listLocalPlaylistTracks: vi.fn().mockResolvedValue([])
}));
vi.mock("@/features/playlist/local-playlist", () => ({
  toCachedProviderTrack: (track: unknown) => track
}));
import {
  hasForegroundPlaybackPreparation,
  prepareTrackForImmediatePlayback
} from "./provider-playback-preparation";

const track: ProviderTrack = {
  provider: "netease", providerTrackId: "1", title: "Song", artist: "Artist",
  album: null, artworkUrl: null, durationMs: 1000, access: "unknown", quality: null
};

describe("shared playback preparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shares the download when a click takes over a prefetch", async () => {
    let resolveDownload!: (record: unknown) => void;
    let downloadSignal!: AbortSignal;
    cache.cacheProviderTrackForPlayback.mockImplementation((_track, signal) => {
      downloadSignal = signal;
      return new Promise(resolve => { resolveDownload = resolve; });
    });
    const controller = new AbortController();
    const background = prepareTrackForImmediatePlayback(track, {
      signal: controller.signal, background: true
    });
    const cancelled = expect(background).rejects.toMatchObject({ name: "AbortError" });
    const foreground = prepareTrackForImmediatePlayback(track);
    controller.abort();
    await cancelled;
    await vi.waitFor(() => expect(cache.cacheProviderTrackForPlayback).toHaveBeenCalledOnce());
    expect(downloadSignal.aborted).toBe(false);
    expect(hasForegroundPlaybackPreparation()).toBe(true);
    resolveDownload({ id: "1", fileHash: "hash" });
    await expect(foreground).resolves.toMatchObject({ record: { fileHash: "hash" } });
    expect(hasForegroundPlaybackPreparation()).toBe(false);
  });

  it("aborts the actual download when its last consumer leaves", async () => {
    let downloadSignal!: AbortSignal;
    cache.cacheProviderTrackForPlayback.mockImplementation((_track, signal: AbortSignal) => {
      downloadSignal = signal;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      );
    });
    const controller = new AbortController();
    const result = prepareTrackForImmediatePlayback(track, {
      signal: controller.signal, background: true
    });
    const cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(cache.cacheProviderTrackForPlayback).toHaveBeenCalledOnce());
    controller.abort();
    await cancelled;
    expect(downloadSignal.aborted).toBe(true);
  });
});
