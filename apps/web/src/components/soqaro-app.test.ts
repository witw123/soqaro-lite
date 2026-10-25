import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isSegmentedAudioOutputReady, startBestEffortPlaybackAudioUnlock } from "@/features/room/hooks/use-room-playback-actions";
import { roomAudioOutput } from "@/features/playback/room-audio-output";

describe("SoqaroApp segmented playback wiring", () => {
  it("mounts the single segmented playback runtime", () => {
    const source = readFileSync(new URL("./soqaro-app.tsx", import.meta.url), "utf8");

    expect(source).toContain("useRoomSegmentedPlaybackRuntime");
  });

  it("starts audio-context unlock without blocking the playback command", () => {
    const unlockAudio = vi.fn(() => new Promise(() => undefined));

    startBestEffortPlaybackAudioUnlock({ unlockAudio });

    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });

  it("does not trust a stale activation flag after AudioContext is suspended", () => {
    vi.spyOn(roomAudioOutput, "isActivated").mockReturnValue(true);
    vi.spyOn(roomAudioOutput, "isAudioContextReady").mockReturnValue(false);

    expect(isSegmentedAudioOutputReady()).toBe(false);
  });

  it("does not wire original assets into segmented playback", () => {
    const source = readFileSync(
      new URL("../features/playback/use-segmented-opus-playback.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain('assetKind: "original"');
  });
});
