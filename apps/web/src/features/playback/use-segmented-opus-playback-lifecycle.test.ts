import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackEncoderVersion, playbackProfileId, type RoomSnapshot, type TrackMeta } from "@soqaro/shared";

// Run the hook's effects explicitly: these tests exercise async ownership, not DOM rendering.
const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  setState: vi.fn()
}));
const audio = vi.hoisted(() => ({
  manifest: vi.fn(),
  createEngine: vi.fn(),
  sync: vi.fn(),
  destroy: vi.fn()
}));
vi.mock("react", () => ({
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    return hooks.refs[index] ??= { current: value };
  },
  useState: (value: unknown) => [value, hooks.setState],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect)
}));
vi.mock("@/features/library/indexeddb", () => ({
  putAssetManifest: audio.manifest,
  getAssetUnit: vi.fn()
}));
vi.mock("./room-audio-output", () => ({
  roomAudioOutput: { getSharedAudioContext: () => ({ state: "running" }) }
}));
vi.mock("./segmented-opus-engine", () => ({
  SegmentedOpusEngine: class {
    constructor() { audio.createEngine(); }
    sync = audio.sync;
    destroy = audio.destroy;
    setBroadcastEnabled = vi.fn();
    setVolume = vi.fn();
    setLoudnessGainDb = vi.fn();
    getSourceHealth = vi.fn();
  }
}));

import { useSegmentedOpusPlayback } from "./use-segmented-opus-playback";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function createInput(): Parameters<typeof useSegmentedOpusPlayback>[0] {
  return {
    roomSnapshot: {
      room: {
        id: "room-1",
        playback: {
          currentTrackId: "track-1", mediaEpoch: 1, playbackRevision: 1,
          status: "playing", positionMs: 0, startAt: new Date().toISOString()
        }
      }
    } as RoomSnapshot,
    currentTrack: { id: "track-1" } as TrackMeta,
    playbackAsset: {
      assetId: "asset-1", profileId: playbackProfileId,
      encoder: { version: playbackEncoderVersion }, unitCount: 10, segmentDurationMs: 2000
    } as TrackMeta["playbackAsset"],
    peerId: "peer-1", isCurrentSource: true, volume: 1, audioUnlocked: true
  };
}

function PlaybackProbe(input: Parameters<typeof useSegmentedOpusPlayback>[0]) {
  hooks.cursor = 0;
  hooks.effects = [];
  useSegmentedOpusPlayback(input);
  return null;
}

describe("segmented startup ownership", () => {
  let cleanups: Array<() => void>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setInterval, clearInterval });
    vi.clearAllMocks();
    hooks.refs = [];
    cleanups = [];
    audio.sync.mockResolvedValue({ state: "live", bufferedUnits: 2 });
  });
  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function mount(input = createInput()) {
    PlaybackProbe(input);
    cleanups = hooks.effects.map((effect) => effect()).filter(
      (cleanup): cleanup is () => void => typeof cleanup === "function"
    );
  }

  it("starts one engine when manifest storage finishes while still owning playback", async () => {
    const pending = deferred();
    audio.manifest.mockReturnValue(pending.promise);
    mount();
    expect(audio.createEngine).not.toHaveBeenCalled();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.createEngine).toHaveBeenCalledTimes(1);
    expect(audio.sync).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect an engine after local-file takeover cancels startup", async () => {
    const pending = deferred();
    audio.manifest.mockReturnValue(pending.promise);
    const input = createInput();
    mount(input);
    cleanups.forEach((cleanup) => cleanup());
    mount({ ...input, disableSourcePlayback: true });
    pending.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(audio.createEngine).not.toHaveBeenCalled();
    expect(audio.sync).not.toHaveBeenCalled();
    cleanups.forEach((cleanup) => cleanup());
    mount(input);
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.createEngine).toHaveBeenCalledTimes(1);
    expect(audio.sync).toHaveBeenCalledTimes(1);
  });

  it("honors local-file takeover even before effect cleanup runs", async () => {
    const pending = deferred();
    audio.manifest.mockReturnValue(pending.promise);
    const input = createInput();
    mount(input);
    PlaybackProbe({ ...input, disableSourcePlayback: true });
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.createEngine).not.toHaveBeenCalled();
  });

  it("ignores a manifest completion after unmount", async () => {
    const pending = deferred();
    audio.manifest.mockReturnValue(pending.promise);
    mount();
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    hooks.setState.mockClear();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.createEngine).not.toHaveBeenCalled();
    expect(hooks.setState).not.toHaveBeenCalled();
  });

  it("ignores a late manifest failure after local-file takeover", async () => {
    const pending = deferred();
    audio.manifest.mockReturnValue(pending.promise);
    const input = createInput();
    mount(input);
    cleanups.forEach((cleanup) => cleanup());
    mount({ ...input, disableSourcePlayback: true });
    hooks.setState.mockClear();
    pending.reject(new Error("manifest write failed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.createEngine).not.toHaveBeenCalled();
    expect(audio.destroy).not.toHaveBeenCalled();
    expect(hooks.setState).not.toHaveBeenCalled();
  });
});
