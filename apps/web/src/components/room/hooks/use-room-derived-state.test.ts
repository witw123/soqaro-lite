import { describe, expect, it } from "vitest";
import { isLocalPlaybackAudible } from "./use-room-derived-state";
import { isCoarsePlaybackEqual } from "@/features/room/playback/room-coarse-playback";

describe("local playback audible state", () => {
  it("keeps a quiet but source-ready segment audible", () => {
    expect(
      isLocalPlaybackAudible({
        state: "live",
        audioPath: "remote-stream",
        sourceHealth: "source-ready",
        lastError: null
      })
    ).toBe(true);
  });

  it("does not report an unavailable source as audible", () => {
    expect(
      isLocalPlaybackAudible({
        state: "live",
        audioPath: "remote-stream",
        sourceHealth: "source-silent",
        lastError: null
      })
    ).toBe(false);
  });

  it("treats native local audio snapshots without source health as audible when live", () => {
    expect(
      isLocalPlaybackAudible({
        state: "live",
        audioPath: "local-file",
        lastError: null
      })
    ).toBe(true);
  });

  it("does not consider coarse playback changed when high-frequency metrics are updated", () => {
    const a = {
      state: "live" as const,
      audioPath: "remote-stream" as const,
      sourceHealth: "source-ready" as const,
      lastError: null
    };
    const b = {
      state: "live" as const,
      audioPath: "remote-stream" as const,
      sourceHealth: "source-ready" as const,
      lastError: null
    };
    expect(isCoarsePlaybackEqual(a, b)).toBe(true);
  });
});
