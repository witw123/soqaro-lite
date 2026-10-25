import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `Intl.Segmenter` needs Chrome 87+ / Safari 14.1+. The Capacitor WebView is
 * not always that new, and this module sits in the root layout's import graph,
 * so a module-scope `new Intl.Segmenter(...)` used to throw while the chunk was
 * evaluated — an unrecoverable white screen, not a degraded lyric panel.
 */
describe("lyrics module on an engine without Intl.Segmenter", () => {
  const originalSegmenter = Reflect.get(Intl, "Segmenter") as unknown;

  afterEach(() => {
    Reflect.set(Intl, "Segmenter", originalSegmenter);
    vi.resetModules();
  });

  it("imports and parses without throwing", async () => {
    expect(Reflect.deleteProperty(Intl, "Segmenter")).toBe(true);
    vi.resetModules();

    const { parseRoomLyrics } = await import("@/features/playback/lyrics");

    expect(parseRoomLyrics("[ti:Demo]\n[00:01.20]第一行\n[00:02.00]Second line")).toEqual([
      { id: "1:0", text: "第一行", timeMs: 1200, words: [] },
      { id: "2:0", text: "Second line", timeMs: 2000, words: [] }
    ]);
  });

  it("keeps per-character timings working without the segmenter", async () => {
    expect(Reflect.deleteProperty(Intl, "Segmenter")).toBe(true);
    vi.resetModules();

    const { parseRoomLyrics } = await import("@/features/playback/lyrics");

    const [line] = parseRoomLyrics("[1000,1200](1000,400,0)你(1400,600,0)好");
    expect(line?.text).toBe("你好");
    expect(line?.words.map((word) => word.text)).toEqual(["你", "好"]);
  });
});
