import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalPlaylistTrackRecord } from "@/features/library/indexeddb";

const preparation = vi.hoisted(() => ({
  foreground: false,
  listeners: new Set<() => void>(),
  prepare: vi.fn()
}));
vi.mock("./provider-playback-preparation", () => ({
  hasForegroundPlaybackPreparation: () => preparation.foreground,
  subscribeForegroundPlaybackPreparation: (listener: () => void) => {
    preparation.listeners.add(listener);
    return () => preparation.listeners.delete(listener);
  },
  prepareTrackForImmediatePlayback: preparation.prepare
}));
import { getQueuePreloadWindow, QueuePreloader } from "./queue-preload";

function track(id: string): LocalPlaylistTrackRecord {
  return {
    id, title: id, artist: "", album: null, artworkUrl: null, lyrics: null,
    provider: "netease", providerTrackId: id, fileHash: null, fileName: null,
    durationMs: 1000, sizeBytes: 0, mimeType: "audio/mpeg",
    availableOffline: false, createdAt: "", updatedAt: ""
  };
}

describe("queue preload window", () => {
  const tracks = Array.from({ length: 100 }, (_, i) => track(String(i)));

  it("prepares only the next two entries of a long queue and advances with playback", () => {
    expect(getQueuePreloadWindow(tracks, "0", "sequence", null, []).map(t => t.id))
      .toEqual(["1", "2"]);
    expect(getQueuePreloadWindow(tracks, "1", "sequence", null, []).map(t => t.id))
      .toEqual(["2", "3"]);
  });

  it("uses the actual shuffle order and gives play-next precedence", () => {
    expect(getQueuePreloadWindow(tracks, "0", "shuffle", "80", ["5", "7", "9"]).map(t => t.id))
      .toEqual(["80", "5"]);
    expect(getQueuePreloadWindow(tracks, "0", "shuffle", null, ["5", "7", "9"]).map(t => t.id))
      .toEqual(["5", "7"]);
  });

  it("does not prefetch on single repeat unless a next track is requested", () => {
    expect(getQueuePreloadWindow(tracks, "0", "single", null, [])).toEqual([]);
    expect(getQueuePreloadWindow(tracks, "0", "single", "9", []).map(t => t.id)).toEqual(["9"]);
    expect(getQueuePreloadWindow(tracks, null, "sequence", null, [])).toEqual([]);
  });
});

describe("queue preload lifecycle", () => {
  let preloader: QueuePreloader;
  const onPrepared = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    preparation.foreground = false;
    preparation.prepare.mockImplementation(() => new Promise(() => {}));
    preloader = new QueuePreloader(onPrepared);
  });
  afterEach(() => preloader.dispose());

  it("keeps overlapping requests and aborts entries removed from the window", () => {
    preloader.update([track("1"), track("2")]);
    const firstSignal = preparation.prepare.mock.calls[0][1].signal as AbortSignal;
    const secondSignal = preparation.prepare.mock.calls[1][1].signal as AbortSignal;
    preloader.update([track("2"), track("3")]);
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(preparation.prepare).toHaveBeenCalledTimes(3);
    preloader.dispose();
    expect(secondSignal.aborted).toBe(true);
  });

  it("yields to foreground playback and resumes the current window afterwards", () => {
    preloader.update([track("1"), track("2")]);
    const signal = preparation.prepare.mock.calls[0][1].signal as AbortSignal;
    preparation.foreground = true;
    for (const listener of preparation.listeners) listener();
    expect(signal.aborted).toBe(true);
    preloader.update([track("3"), track("4")]);
    expect(preparation.prepare).toHaveBeenCalledTimes(2);
    preparation.foreground = false;
    for (const listener of preparation.listeners) listener();
    expect(preparation.prepare.mock.calls.slice(2).map(([t]) => t.id)).toEqual(["3", "4"]);
  });

  it("does not restart completed entries when queue metadata refreshes", async () => {
    preparation.prepare.mockResolvedValue({ record: track("1"), source: "playback-cache" });
    preloader.update([track("1")]);
    await Promise.resolve();
    preloader.update([{ ...track("1"), title: "Updated" }]);
    expect(onPrepared).toHaveBeenCalledOnce();
    expect(preparation.prepare).toHaveBeenCalledOnce();
  });
});
