import { afterEach, describe, expect, it, vi } from "vitest";
const tauri = vi.hoisted(() => ({ listen: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/desktop/tauri")>(),
  listenTauri: tauri.listen
}));
import {
  createPlaybackMediaSessionKey,
  installBrowserMediaSessionActionHandlers,
  syncBrowserMediaSession
} from "./playback-media-session";

describe("playback media session key", () => {
  it("ignores ordinary room snapshot fields", () => {
    const base = {
      trackId: "track_1",
      playbackAssetId: "asset_1",
      mediaEpoch: 4,
      playbackRevision: 9,
      startAt: "2026-07-15T00:00:00.000Z",
      sourcePeerId: "peer_a",
      remoteTrackId: "remote_1"
    };

    expect(createPlaybackMediaSessionKey(base)).toBe(
      "track_1|asset_1|4|2026-07-15T00:00:00.000Z|peer_a|remote_1"
    );
    expect(createPlaybackMediaSessionKey({ ...base })).toBe(createPlaybackMediaSessionKey(base));
  });

  it("changes only when a media identity field changes", () => {
    const base = {
      trackId: "track_1",
      playbackAssetId: "asset_1",
      mediaEpoch: 4,
      playbackRevision: 9,
      startAt: "start",
      sourcePeerId: "peer_a",
      remoteTrackId: null
    };
    expect(createPlaybackMediaSessionKey({ ...base, remoteTrackId: "remote_2" })).not.toBe(
      createPlaybackMediaSessionKey(base)
    );
    expect(createPlaybackMediaSessionKey({ ...base, playbackRevision: 10 })).toBe(
      createPlaybackMediaSessionKey(base)
    );
  });
});

describe("browser media session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes system media actions to room playback actions", async () => {
    const handlers = new Map<string, ((details?: unknown) => void) | null>();
    const mediaSession = {
      metadata: null,
      playbackState: "none",
      setActionHandler: vi.fn((action: string, handler: ((details?: unknown) => void) | null) => {
        handlers.set(action, handler);
      }),
      setPositionState: vi.fn()
    };
    vi.stubGlobal("navigator", { mediaSession });
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onSeek = vi.fn();

    const cleanup = installBrowserMediaSessionActionHandlers({
      onPlay,
      onPause,
      getPositionMs: () => 30_000,
      onSeek
    });

    handlers.get("play")?.();
    handlers.get("pause")?.();
    handlers.get("seekbackward")?.({ seekOffset: 5 });
    await Promise.resolve();

    expect(onPlay).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(25_000);
    cleanup();
    expect(mediaSession.setActionHandler).toHaveBeenLastCalledWith("seekto", null);
  });

  it("toggles the active player with the hardware play/pause key", async () => {
    let callback!: (key: string) => void;
    const stop = vi.fn();
    tauri.listen.mockImplementationOnce(async (_event, handler) => {
      callback = handler;
      return stop;
    });
    const onPlay = vi.fn();
    const onToggle = vi.fn();
    const cleanup = installBrowserMediaSessionActionHandlers({ onPlay, onToggle });
    await Promise.resolve();
    callback("play-pause");
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onPlay).not.toHaveBeenCalled();
    cleanup();
    callback("play-pause");
    expect(onToggle).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("removes a delayed native listener after the old player has unmounted", async () => {
    let finish!: (stop: () => void) => void;
    tauri.listen.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const cleanup = installBrowserMediaSessionActionHandlers({ onPlay: vi.fn() });
    cleanup();
    const stop = vi.fn();
    finish(stop);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("publishes track metadata, playback state, and position", () => {
    class FakeMediaMetadata {
      constructor(public readonly init: Record<string, unknown>) {}
    }
    const mediaSession = {
      metadata: null as unknown,
      playbackState: "none",
      setActionHandler: vi.fn(),
      setPositionState: vi.fn()
    };
    vi.stubGlobal("navigator", { mediaSession });
    vi.stubGlobal("MediaMetadata", FakeMediaMetadata);

    syncBrowserMediaSession({
      track: {
        id: "track_1",
        title: "夜航",
        artist: "音乐房",
        album: "现场",
        artworkUrl: "https://example.com/cover.jpg",
        durationMs: 180_000
      } as never,
      playback: {
        currentTrackId: "track_1",
        status: "playing",
        positionMs: 12_000
      },
      positionMs: 15_000
    });

    expect(mediaSession.playbackState).toBe("playing");
    expect(mediaSession.metadata).toMatchObject({
      init: {
        title: "夜航",
        artist: "音乐房",
        album: "现场",
        artwork: [
          { src: "https://example.com/cover.jpg", sizes: "96x96" },
          { src: "https://example.com/cover.jpg", sizes: "256x256" },
          { src: "https://example.com/cover.jpg", sizes: "512x512" }
        ]
      }
    });
    expect(mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: 180,
      position: 15,
      playbackRate: 1
    });
  });

  it("defers the browser media session to the native plugin on Capacitor", () => {
    const mediaSession = {
      metadata: null as unknown,
      playbackState: "none",
      setActionHandler: vi.fn(),
      setPositionState: vi.fn()
    };
    vi.stubGlobal("navigator", { mediaSession });
    vi.stubGlobal("window", {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { SystemMediaControls: {} }
      }
    });

    syncBrowserMediaSession({
      track: {
        id: "track_1",
        title: "夜航",
        artist: "音乐房",
        album: "现场",
        artworkUrl: "https://example.com/cover.jpg",
        durationMs: 180_000
      } as never,
      playback: {
        currentTrackId: "track_1",
        status: "playing",
        positionMs: 12_000
      }
    });

    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe("none");

    const cleanup = installBrowserMediaSessionActionHandlers({ onPlay: vi.fn() });
    expect(mediaSession.setActionHandler).not.toHaveBeenCalled();
    cleanup();
  });
});
