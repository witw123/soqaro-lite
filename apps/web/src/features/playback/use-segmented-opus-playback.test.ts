import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSegmentedPlaybackFailureSnapshot,
  hasActiveSegmentedPlayback,
  resolveSegmentedPlaybackEngineIdentity,
  resolveSegmentedPlaybackIdentity
} from "./use-segmented-opus-playback";

const current = {
  state: "live" as const,
  bufferedMs: 8_000,
  ownedUnitCount: 5,
  totalUnitCount: 80,
  audioContextState: "running" as const,
  lastError: null
};

describe("segmented playback recovery", () => {
  it("changes playback identity before a new timeline can reuse the old ended state", () => {
    const first = resolveSegmentedPlaybackIdentity({
      playback: {
        currentTrackId: "track_1",
        mediaEpoch: 1,
        playbackRevision: 4,
        startAt: "2026-07-15T00:00:00.000Z"
      },
      playbackAssetId: "asset-1"
    });
    const next = resolveSegmentedPlaybackIdentity({
      playback: {
        currentTrackId: "track_2",
        mediaEpoch: 2,
        playbackRevision: 5,
        startAt: "2026-07-15T00:03:00.000Z"
      },
      playbackAssetId: "asset-2"
    });

    expect(first).not.toBe(next);
  });

  it("keeps the media engine identity stable across timeline-only changes", () => {
    const first = resolveSegmentedPlaybackEngineIdentity({
      playback: {
        currentTrackId: "track_1",
        mediaEpoch: 1,
        playbackRevision: 4,
        startAt: "2026-07-15T00:00:00.000Z"
      },
      playbackAssetId: "asset-1"
    });
    const resumed = resolveSegmentedPlaybackEngineIdentity({
      playback: {
        currentTrackId: "track_1",
        mediaEpoch: 1,
        playbackRevision: 5,
        startAt: "2026-07-15T00:01:00.000Z"
      },
      playbackAssetId: "asset-1"
    });

    expect(resumed).toBe(first);
  });

  it("releases the local engine when the authoritative playback has no track", () => {
    expect(hasActiveSegmentedPlayback({
      isCurrentSource: true,
      currentTrackId: null,
      hasPlaybackAsset: true
    })).toBe(false);
    expect(hasActiveSegmentedPlayback({
      isCurrentSource: true,
      currentTrackId: "track_1",
      hasPlaybackAsset: true
    })).toBe(true);
  });

  it("keeps a decode failure recoverable while AudioContext is running", () => {
    expect(buildSegmentedPlaybackFailureSnapshot({
      current,
      totalUnitCount: 160,
      audioContextState: "running",
      error: new Error("decode failed")
    })).toMatchObject({
      state: "buffering",
      totalUnitCount: 160,
      audioContextState: "running",
      lastError: "decode failed"
    });
  });

  it("re-enters unlock flow when the context was suspended", () => {
    expect(buildSegmentedPlaybackFailureSnapshot({
      current,
      totalUnitCount: 160,
      audioContextState: "suspended",
      error: "failure"
    })).toMatchObject({
      state: "awaiting-unlock",
      lastError: "分段音频读取或解码失败"
    });
  });

  it("drops the failed engine so the next tick creates a fresh instance", () => {
    const source = readFileSync(new URL("./use-segmented-opus-playback.ts", import.meta.url), "utf8");

    expect(source).toContain("engineRef.current = null");
    expect(source).toContain("failedEngine?.destroy()");
    expect(source).toContain("engineRef.current ??= new SegmentedOpusEngine()");
    expect(source).toContain("storedManifestAssetIdRef.current = null");
  });

  it("does not rebuild the engine effect for barrier clock anchor updates", () => {
    const source = readFileSync(new URL("./use-segmented-opus-playback.ts", import.meta.url), "utf8");
    const effectDependencies = source.slice(
      source.indexOf("    roomId,"),
      source.indexOf("  ]);", source.indexOf("    roomId,"))
    );

    expect(effectDependencies).not.toContain("holdPositionMs");
    expect(effectDependencies).not.toContain("resumeAtMs");
  });
});
