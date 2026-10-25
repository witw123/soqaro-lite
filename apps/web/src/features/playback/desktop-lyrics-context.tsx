"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { TrackMeta } from "@soqaro/shared";
import {
  appSettingsChangeEvent,
  getAppSettings,
  updateAppSettings
} from "@/features/settings/settings-store";
import {
  getActiveRoomLyricIndex,
  alignRoomLyricLines,
  fetchProviderLyricsCached,
  getRoomLyricDisplayWords,
  hasWordSyncedRoomLyrics,
  parseRoomLyrics,
  selectRoomLyrics
} from "@/features/playback/lyrics";
import {
  capacitorPlugin,
  invokeTauri,
  isCapacitorRuntime,
  isTauriRuntime
} from "@/lib/desktop/tauri";

export type DesktopLyricsSource = "room" | "local";

export type DesktopLyricsPlayer = {
  source: DesktopLyricsSource;
  currentTrack: TrackMeta | null;
  playbackTrackId: string | null | undefined;
  isPlaying: boolean;
  progressMs: number;
  /** Host wall-clock time (Date.now()) when progressMs was sampled. */
  anchorAt: number;
  artworkUrl: string | null;
  canControlPlayback: boolean;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
};

type DesktopLyricsRegistration = {
  updatePlayer: (player: DesktopLyricsPlayer) => void;
  unregisterPlayer: () => void;
};

type DesktopLyricsContextValue = {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  activePlayer: DesktopLyricsPlayer | null;
  lyrics: DesktopLyricsState;
  showTranslation: boolean;
  showRomanized: boolean;
  toggleTranslation: () => void;
  toggleRomanized: () => void;
  registerPlayer: (source: DesktopLyricsSource, player: DesktopLyricsPlayer) => DesktopLyricsRegistration;
};

type DesktopLyricsState = {
  status: "idle" | "loading" | "ready" | "error";
  plainLyric: string | null;
  wordSyncedLyric: string | null;
  translatedLyric: string | null;
  romanizedLyric: string | null;
  currentLine: string | null;
  translatedLine: string | null;
  romanizedLine: string | null;
};

type CachedLyrics = Omit<DesktopLyricsState, "status" | "currentLine" | "translatedLine" | "romanizedLine"> & {
  wordSyncedLyric?: string | null;
};

const desktopLyricsPositionStorageKey = "soqaro-desktop-lyrics-position-v1";
const desktopLyricsBridgeChannelName = "soqaro-desktop-lyrics";
const desktopLyricsBridgeSnapshotKey = "soqaro-desktop-lyrics-snapshot";
const lyricRequestCache = new Map<string, Promise<CachedLyrics>>();

type NativeDesktopLyricsPlugin = {
  toggle?: (args?: Record<string, unknown>) => Promise<{ granted?: boolean; visible?: boolean } | undefined>;
  hide?: (args?: Record<string, unknown>) => Promise<unknown>;
  updateLine?: (args: Record<string, unknown>) => Promise<unknown>;
  updatePlayback?: (args: Record<string, unknown>) => Promise<unknown>;
};

function getNativeDesktopLyricsPlugin(): NativeDesktopLyricsPlugin | undefined {
  return capacitorPlugin("DesktopLyrics") as NativeDesktopLyricsPlugin | undefined;
}

export const soqaroCloseDesktopLyricsEvent = "soqaro:close-desktop-lyrics";

export function closeDesktopLyricsNative() {
  if (isTauriRuntime()) {
    void invokeTauri("hide_desktop_lyrics_window");
  } else if (isCapacitorRuntime()) {
    void getNativeDesktopLyricsPlugin()?.hide?.({});
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(soqaroCloseDesktopLyricsEvent));
  }
}

const emptyLyrics: DesktopLyricsState = {
  status: "idle",
  plainLyric: null,
  wordSyncedLyric: null,
  translatedLyric: null,
  romanizedLyric: null,
  currentLine: null,
  translatedLine: null,
  romanizedLine: null
};

const DesktopLyricsContext = createContext<DesktopLyricsContextValue | null>(null);

export function DesktopLyricsProvider({
  children, activeSource
}: { children: ReactNode; activeSource: DesktopLyricsSource | null }) {
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;
  const playersRef = useRef(new Map<DesktopLyricsSource, DesktopLyricsPlayer>());
  const [activePlayer, setActivePlayer] = useState<DesktopLyricsPlayer | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lyrics, setLyrics] = useState<DesktopLyricsState>(emptyLyrics);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showRomanized, setShowRomanized] = useState(false);
  const activePlayerRef = useRef<DesktopLyricsPlayer | null>(null);
  const bridgeChannelRef = useRef<BroadcastChannel | null>(null);
  const lastBridgeSnapshotWriteAtRef = useRef(0);
  activePlayerRef.current = activePlayer;
  const hasActivePlayer = activePlayer !== null;

  const close = useCallback(() => {
    if (isTauriRuntime()) {
      void invokeTauri("hide_desktop_lyrics_window");
    } else if (isCapacitorRuntime()) {
      void getNativeDesktopLyricsPlugin()?.hide?.({});
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleClose = () => close();
    window.addEventListener(soqaroCloseDesktopLyricsEvent, handleClose);
    return () => window.removeEventListener(soqaroCloseDesktopLyricsEvent, handleClose);
  }, [close]);

  const selectActivePlayer = useCallback(() => {
    const player = activeSourceRef.current
      ? playersRef.current.get(activeSourceRef.current)
      : null;
    setActivePlayer(player?.currentTrack || player?.playbackTrackId ? player : null);
  }, []);

  useEffect(() => {
    selectActivePlayer();
  }, [activeSource, selectActivePlayer]);

  const registerPlayer = useCallback((source: DesktopLyricsSource, player: DesktopLyricsPlayer) => {
    playersRef.current.set(source, player);
    selectActivePlayer();

    return {
      updatePlayer: (nextPlayer: DesktopLyricsPlayer) => {
        playersRef.current.set(source, nextPlayer);
        // selectActivePlayer is the single setState; calling setActivePlayer here too
        // made every progress tick commit context state twice.
        selectActivePlayer();
      },
      unregisterPlayer: () => {
        const current = playersRef.current.get(source);
        if (current === player || current?.source === source) {
          playersRef.current.delete(source);
          selectActivePlayer();
          if (source === "room") {
            close();
          }
        }
      }
    };
  }, [close, selectActivePlayer]);

  useEffect(() => {
    const syncSettings = () => {
      const playback = getAppSettings().playback;
      setShowTranslation(playback.showLyricTranslation);
      setShowRomanized(playback.showLyricRomanized);
    };
    syncSettings();
    window.addEventListener(appSettingsChangeEvent, syncSettings);
    window.addEventListener("storage", syncSettings);
    return () => {
      window.removeEventListener(appSettingsChangeEvent, syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  const activeTrackKey = activePlayer?.currentTrack
    ? `${activePlayer.currentTrack.sourceType}:${activePlayer.currentTrack.sourceRef?.trackId ?? activePlayer.currentTrack.id}:${activePlayer.currentTrack.lyrics ?? ""}:${activePlayer.currentTrack.translatedLyrics ?? ""}:${activePlayer.currentTrack.romanizedLyrics ?? ""}`
    : null;
  const activeTrack = activePlayer?.currentTrack ?? null;
  const activeProgressMs = activePlayer?.progressMs ?? 0;
  const activeIsPlaying = activePlayer?.isPlaying === true;

  useEffect(() => {
    let cancelled = false;
    const track = activeTrack;
    if (!track) {
      setLyrics(emptyLyrics);
      return () => {
        cancelled = true;
      };
    }

    const localLyrics = track.lyrics?.trim() || null;
    const localTranslated = track.translatedLyrics?.trim() || null;
    const localRomanized = track.romanizedLyrics?.trim() || null;
    const provider = track.sourceRef?.provider;
    const providerTrackId = track.sourceRef?.trackId;
    const directLyrics = selectRoomLyrics({ localLyrics });

    setLyrics({
      status: directLyrics || localTranslated || localRomanized ? "ready" : provider && providerTrackId ? "loading" : "ready",
      plainLyric: directLyrics,
      wordSyncedLyric: hasWordSyncedRoomLyrics(directLyrics) ? directLyrics : null,
      translatedLyric: localTranslated,
      romanizedLyric: localRomanized,
      currentLine: null,
      translatedLine: null,
      romanizedLine: null
    });

    const isSupportedProvider = provider === "netease" || provider === "qqmusic" || provider === "bilibili";
    const hasWordSynced = hasWordSyncedRoomLyrics(directLyrics);
    if (
      !isSupportedProvider ||
      !providerTrackId ||
      (hasWordSynced && localTranslated && localRomanized)
    ) {
      return () => {
        cancelled = true;
      };
    }

    const cacheKey = `${provider}:${providerTrackId}`;
    let request = lyricRequestCache.get(cacheKey);
    if (!request) {
      request = loadProviderLyrics(provider as "netease" | "qqmusic" | "bilibili", providerTrackId);
      lyricRequestCache.set(cacheKey, request);
    }

    void request.then((result) => {
      if (cancelled) return;
      const resolvedPlain = selectRoomLyrics({
        localLyrics: directLyrics,
        wordSyncedLyric: result.wordSyncedLyric,
        plainLyric: result.plainLyric ?? directLyrics
      });
      const resolvedTranslated = result.translatedLyric || localTranslated;
      const resolvedRomanized = result.romanizedLyric || localRomanized;
      setLyrics({
        status: resolvedPlain || resolvedTranslated || resolvedRomanized ? "ready" : "error",
        plainLyric: resolvedPlain,
        wordSyncedLyric: result.wordSyncedLyric || (hasWordSyncedRoomLyrics(resolvedPlain) ? resolvedPlain : null),
        translatedLyric: resolvedTranslated,
        romanizedLyric: resolvedRomanized,
        currentLine: null,
        translatedLine: null,
        romanizedLine: null
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTrack, activeTrackKey]);

  const lyricLines = useMemo(() => parseRoomLyrics(lyrics.plainLyric), [lyrics.plainLyric]);
  const translatedLines = useMemo(() => parseRoomLyrics(lyrics.translatedLyric), [lyrics.translatedLyric]);
  const romanizedLines = useMemo(() => parseRoomLyrics(lyrics.romanizedLyric), [lyrics.romanizedLyric]);
  // Alignments only depend on the lyric text; computing them per progress tick
  // rescanned both line lists every time the position updated.
  const translatedAlignment = useMemo(
    () => alignRoomLyricLines(lyricLines, translatedLines),
    [lyricLines, translatedLines]
  );
  const romanizedAlignment = useMemo(
    () => alignRoomLyricLines(lyricLines, romanizedLines),
    [lyricLines, romanizedLines]
  );

  useEffect(() => {
    if (!hasActivePlayer || lyricLines.length === 0) {
      setLyrics((current) => {
        if (current.currentLine === null && current.translatedLine === null && current.romanizedLine === null) {
          return current;
        }
        return { ...current, currentLine: null, translatedLine: null, romanizedLine: null };
      });
      return;
    }
    const activeIndex = Math.max(0, getActiveRoomLyricIndex(lyricLines, activeProgressMs));
    const activeLine = lyricLines[activeIndex];
    const translatedLine = translatedAlignment[activeIndex]?.text ?? null;
    const romanizedLine = romanizedAlignment[activeIndex]?.text ?? null;
    setLyrics((current) => {
      if (
        current.currentLine === (activeLine?.text ?? null) &&
        current.translatedLine === translatedLine &&
        current.romanizedLine === romanizedLine
      ) {
        return current;
      }
      return {
        ...current,
        currentLine: activeLine?.text ?? null,
        translatedLine,
        romanizedLine
      };
    });
  }, [activeProgressMs, hasActivePlayer, lyricLines, romanizedAlignment, translatedAlignment]);

  const toggleTranslation = useCallback(() => {
    setShowTranslation((current) => {
      const next = !current;
      updateAppSettings({ playback: { showLyricTranslation: next } });
      return next;
    });
  }, []);

  const toggleRomanized = useCallback(() => {
    setShowRomanized((current) => {
      const next = !current;
      updateAppSettings({ playback: { showLyricRomanized: next } });
      return next;
    });
  }, []);

  // ── Tauri desktop shell: bridge playback state to the native lyrics window
  // over BroadcastChannel; the window posts transport commands back. ──
  useEffect(() => {
    // Skip inside the lyrics window itself: it has no registered player and
    // must not echo empty state back at the main window.
    if (!isTauriRuntime() || !hasActivePlayer) return;
    const channel = new BroadcastChannel(desktopLyricsBridgeChannelName);
    channel.onmessage = (event) => {
      const data = event.data as { type?: string; action?: string; scale?: number } | null;
      if (!data || data.type !== "command") return;
      const player = activePlayerRef.current;
      if (data.action === "prev" && player?.canControlPlayback) player.onPrev();
      if (data.action === "toggle" && player?.canControlPlayback) player.onTogglePlay();
      if (data.action === "next" && player?.canControlPlayback) player.onNext();
      if (data.action === "toggleTranslation") toggleTranslation();
      if (data.action === "toggleRomanized") toggleRomanized();
      if (data.action === "close") close();
      if (data.action === "setScale" && typeof data.scale === "number") {
        updateAppSettings({ playback: { desktopLyricScale: data.scale } });
      }
    };
    bridgeChannelRef.current = channel;
    return () => {
      channel.onmessage = null;
      channel.close();
      if (bridgeChannelRef.current === channel) {
        bridgeChannelRef.current = null;
      }
    };
  }, [close, hasActivePlayer, toggleRomanized, toggleTranslation]);

  const bridgeTrackPayload = useMemo(() => {
    if (!activeTrack) return null;
    return {
      title: activeTrack.title,
      artist: activeTrack.artist,
      artworkUrl: activePlayer?.artworkUrl ?? activeTrack.artworkUrl ?? null,
      durationMs: activeTrack.durationMs ?? null,
      plainLyric: lyrics.plainLyric,
      wordSyncedLyric: lyrics.wordSyncedLyric,
      translatedLyric: lyrics.translatedLyric,
      romanizedLyric: lyrics.romanizedLyric
    };
  }, [activeTrack, activePlayer?.artworkUrl, lyrics.plainLyric, lyrics.wordSyncedLyric, lyrics.translatedLyric, lyrics.romanizedLyric]);

  // Progress anchors are throttled: the lyrics window interpolates between anchors
  // with rAF, so a 250ms cadence looks identical at a quarter of the bridge traffic.
  // Track identity ensures track changes immediately bypass the 250ms throttle.
  const trackIdentity = activePlayer?.playbackTrackId ?? activeTrack?.id ?? "";
  const bridgeStructureKey = `${trackIdentity}|${activeIsPlaying}|${activePlayer?.canControlPlayback === true && Boolean(activePlayer?.playbackTrackId)}|${showTranslation}|${showRomanized}|${bridgeTrackPayload ? "t" : "n"}|${lyrics.plainLyric ?? ""}|${lyrics.wordSyncedLyric ?? ""}|${lyrics.translatedLyric ?? ""}|${lyrics.romanizedLyric ?? ""}`;
  const lastBridgeStructureKeyRef = useRef<string | null>(null);
  const lastBridgePostAtRef = useRef(0);

  useEffect(() => {
    if (!isTauriRuntime() || !hasActivePlayer) return;
    const channel = bridgeChannelRef.current;
    if (!channel) return;
    const structureChanged = lastBridgeStructureKeyRef.current !== bridgeStructureKey;
    const now = Date.now();
    if (!structureChanged && now - lastBridgePostAtRef.current < 250) return;
    lastBridgeStructureKeyRef.current = bridgeStructureKey;
    const liveProgress = activePlayer && activeIsPlaying
      ? Math.max(0, activePlayer.progressMs + (now - activePlayer.anchorAt))
      : activeProgressMs;
    const payload = {
      type: "state" as const,
      at: now,
      anchorAt: now,
      progressMs: Math.round(liveProgress),
      isPlaying: activeIsPlaying,
      canControl: activePlayer?.canControlPlayback === true && Boolean(activePlayer?.playbackTrackId),
      showTranslation,
      showRomanized,
      track: bridgeTrackPayload
    };
    try {
      channel.postMessage(payload);
    } catch {
      // Bridge traffic is best-effort; the window re-syncs on the next tick.
    }
    if (now - lastBridgeSnapshotWriteAtRef.current >= 500) {
      lastBridgeSnapshotWriteAtRef.current = now;
      try {
        window.localStorage.setItem(desktopLyricsBridgeSnapshotKey, JSON.stringify(payload));
      } catch {
        // Storage may be unavailable; the channel still keeps the window live.
      }
    }
  }, [activeIsPlaying, activePlayer, activeProgressMs, bridgeStructureKey, bridgeTrackPayload, hasActivePlayer, showRomanized, showTranslation]);

  // ── Capacitor mobile shell: push anchors and char-level word timings to the
  // native SYSTEM_ALERT_WINDOW overlay; it interpolates and draws per frame. ──
  const lastNativePlaybackPostAtRef = useRef(0);
  useEffect(() => {
    if (!isCapacitorRuntime() || !hasActivePlayer) return;
    const now = Date.now();
    if (now - lastNativePlaybackPostAtRef.current < 250) return;
    lastNativePlaybackPostAtRef.current = now;
    getNativeDesktopLyricsPlugin()?.updatePlayback?.({
      isPlaying: activeIsPlaying,
      progressMs: activeProgressMs,
      at: now
    });
  }, [activeIsPlaying, activeProgressMs, hasActivePlayer]);

  const lastNativeLineKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isCapacitorRuntime() || !hasActivePlayer || lyricLines.length === 0) return;
    const plugin = getNativeDesktopLyricsPlugin();
    if (!plugin?.updateLine) return;
    const activeIndex = Math.max(0, getActiveRoomLyricIndex(lyricLines, activeProgressMs));
    const lineKey = `${lyricLines.length}:${activeIndex}:${showTranslation}:${showRomanized}`;
    if (lastNativeLineKeyRef.current === lineKey) return;
    lastNativeLineKeyRef.current = lineKey;
    const words = getRoomLyricDisplayWords(lyricLines, activeIndex).map((word) => ({
      t: word.text,
      s: word.timeMs,
      d: word.durationMs
    }));
    const translation = showTranslation
      ? translatedAlignment[activeIndex]?.text ?? null
      : null;
    const romanized = showRomanized
      ? romanizedAlignment[activeIndex]?.text ?? null
      : null;
    plugin.updateLine({ words: JSON.stringify(words), translation, romanized });
  }, [activeProgressMs, hasActivePlayer, lyricLines, romanizedAlignment, showRomanized, showTranslation, translatedAlignment]);

  const toggle = useCallback(() => {
    if (isTauriRuntime()) {
      // The async shell command reports the real post-toggle visibility;
      // optimistic state would drift when window creation fails.
      void invokeTauri<boolean>("toggle_desktop_lyrics").then((visible) => {
        if (typeof visible === "boolean") {
          setIsOpen(visible);
        }
      });
      return;
    }
    if (isCapacitorRuntime()) {
      // Without the overlay permission this opens the system settings page;
      // toggling again after granting shows the lyrics.
      void getNativeDesktopLyricsPlugin()?.toggle?.({});
      setIsOpen((current) => !current);
      return;
    }
    setIsOpen((current) => !current);
  }, []);

  const value = useMemo<DesktopLyricsContextValue>(() => ({
    isOpen,
    toggle,
    close,
    activePlayer,
    lyrics,
    showTranslation,
    showRomanized,
    toggleTranslation,
    toggleRomanized,
    registerPlayer
  }), [activePlayer, close, isOpen, lyrics, registerPlayer, showRomanized, showTranslation, toggle, toggleRomanized, toggleTranslation]);

  return <DesktopLyricsContext.Provider value={value}>{children}</DesktopLyricsContext.Provider>;
}

export function useDesktopLyrics() {
  const context = useContext(DesktopLyricsContext);
  if (!context) {
    throw new Error("useDesktopLyrics must be used inside DesktopLyricsProvider");
  }
  return context;
}

export function useMaybeDesktopLyrics() {
  return useContext(DesktopLyricsContext);
}

export function useDesktopLyricsRegistration(player: DesktopLyricsPlayer) {
  const { registerPlayer } = useDesktopLyrics();
  const registrationRef = useRef<DesktopLyricsRegistration | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    registrationRef.current = registerPlayer(player.source, playerRef.current);
    return () => {
      registrationRef.current?.unregisterPlayer();
      registrationRef.current = null;
    };
  }, [player.source, registerPlayer]);

  useEffect(() => {
    registrationRef.current?.updatePlayer(player);
  }, [player]);
}

async function loadProviderLyrics(provider: "netease" | "qqmusic" | "bilibili", trackId: string): Promise<CachedLyrics> {
  try {
    const response = await fetchProviderLyricsCached(provider, trackId);
    return {
      plainLyric: response.plainLyric?.trim() || null,
      wordSyncedLyric: response.wordSyncedLyric?.trim() || null,
      translatedLyric: response.translatedLyric?.trim() || null,
      romanizedLyric: response.romanizedLyric?.trim() || null
    };
  } catch {
    return { plainLyric: null, wordSyncedLyric: null, translatedLyric: null, romanizedLyric: null };
  }
}

export function getDesktopLyricsPositionStorageKey() {
  return desktopLyricsPositionStorageKey;
}
