import { describe, expect, it } from "vitest";
import {
  resolveAnchoredProgressMs,
  resolveCanvasFrameDelayMs,
  resolveProgressRenderIntervalMs
} from "./render-scheduler";

describe("render scheduler helpers", () => {
  it("caps decorative canvas rendering while keeping live visuals responsive", () => {
    expect(
      resolveCanvasFrameDelayMs({
        isPageVisible: true,
        isPlaying: true,
        reducedMotion: false
      })
    ).toBe(33);
  });

  it("slows decorative canvas rendering for idle or reduced-motion states", () => {
    expect(
      resolveCanvasFrameDelayMs({
        isPageVisible: true,
        isPlaying: false,
        reducedMotion: false
      })
    ).toBe(250);
    expect(
      resolveCanvasFrameDelayMs({
        isPageVisible: true,
        isPlaying: true,
        reducedMotion: true
      })
    ).toBe(100);
  });

  it("stops decorative canvas rendering while the page is hidden", () => {
    expect(
      resolveCanvasFrameDelayMs({
        isPageVisible: false,
        isPlaying: true,
        reducedMotion: false
      })
    ).toBeNull();
  });

  it("uses coarse React progress rendering without losing exact anchored progress", () => {
    expect(resolveProgressRenderIntervalMs({ isPageVisible: true })).toBe(250);
    expect(resolveProgressRenderIntervalMs({ isPageVisible: false })).toBe(1000);
    expect(
      resolveAnchoredProgressMs({
        progressMs: 1_000,
        receivedAtMs: 2_000,
        durationMs: 10_000,
        nowMs: 2_750
      })
    ).toBe(1_750);
  });
});
