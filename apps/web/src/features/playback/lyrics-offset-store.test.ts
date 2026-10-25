import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTrackLyricsOffset,
  resetTrackLyricsOffset,
  setTrackLyricsOffset,
  lyricsOffsetStorageKey,
  MAX_LYRICS_OFFSET_MS,
  MIN_LYRICS_OFFSET_MS
} from "./lyrics-offset-store";

describe("lyrics-offset-store", () => {
  const store = new Map<string, string>();
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key);
        })
      },
      dispatchEvent
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns 0 for track with no offset", () => {
    expect(getTrackLyricsOffset("track-1")).toBe(0);
    expect(getTrackLyricsOffset(null)).toBe(0);
  });

  it("persists and reads track offset", () => {
    setTrackLyricsOffset("track-1", 500);
    expect(getTrackLyricsOffset("track-1")).toBe(500);

    const stored = JSON.parse(store.get(lyricsOffsetStorageKey) || "{}");
    expect(stored["track-1"]).toBe(500);
  });

  it("clamps offset to min and max boundaries", () => {
    setTrackLyricsOffset("track-too-large", 20000);
    expect(getTrackLyricsOffset("track-too-large")).toBe(MAX_LYRICS_OFFSET_MS);

    setTrackLyricsOffset("track-too-small", -20000);
    expect(getTrackLyricsOffset("track-too-small")).toBe(MIN_LYRICS_OFFSET_MS);
  });

  it("deletes key when offset is reset to 0", () => {
    setTrackLyricsOffset("track-1", 1000);
    expect(getTrackLyricsOffset("track-1")).toBe(1000);

    resetTrackLyricsOffset("track-1");
    expect(getTrackLyricsOffset("track-1")).toBe(0);

    const stored = JSON.parse(store.get(lyricsOffsetStorageKey) || "{}");
    expect(stored["track-1"]).toBeUndefined();
  });

  it("dispatches lyricsOffsetChangeEvent on update", () => {
    setTrackLyricsOffset("track-event", -500);
    expect(dispatchEvent).toHaveBeenCalled();
  });
});
