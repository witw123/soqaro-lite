"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PlaybackSnapshot, ProviderTrackCandidate, QueueItem, RoomMember, TrackMeta } from "@soqaro/shared";
import {
  DesktopBottomPlayerLayout,
  MobileBottomPlayerLayout
} from "./bottom-player-layout";
import {
  resolveAnchoredProgressMs,
  resolveProgressRenderIntervalMs
} from "@/features/playback/render-scheduler";
import {
  isPendingSeekTargetReached,
  shouldResolvePendingSeek,
  type PendingSeek
} from "./seek-state";
import { ImmersivePlayerOverlay } from "./ImmersivePlayerOverlay";
import { useScreenWakeLock, useSystemMediaTransport } from "@/features/playback/system-media-bridge";
import {
  installBrowserMediaSessionActionHandlers,
  syncBrowserMediaSession
} from "@/features/playback/playback-media-session";
import {
  MiniPlayerOverlay,
  requestMiniPlayerWindow
} from "./MiniPlayerOverlay";
import { useArtworkPalette } from "./artwork-colors";
import { usePreferredArtworkUrl } from "./preferred-artwork";
import { usePlayerStyle } from "@/features/settings/use-player-style";
import { useSessionIdentity } from "@/features/session/use-session-identity";
import { useFavoriteTracks } from "@/features/favorites/use-favorite-tracks";
import { usePersonalizationReporter } from "@/features/personalization/use-personalization-reporter";
import {
  useDesktopLyrics,
  useDesktopLyricsRegistration,
  type DesktopLyricsSource
} from "@/features/playback/desktop-lyrics-context";
import {
  getRoomPlaybackClockNowMs,
  type RoomPlaybackBarrierClock
} from "@/features/playback/room-playback-clock";

type BottomPlayerProps = {
  roomId?: string | null;
  roomTitle?: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playback: PlaybackSnapshot | null;
  playbackBarrier?: RoomPlaybackBarrierClock | null;
  canControlPlayback: boolean;
  canSeekPlayback: boolean;
  progressMs: number;
  seekDraft: number | null;
  setSeekDraft: (v: number | null) => void;
  audioDurationMs: number;
  volume: number;
  setVolume: (value: number) => void;
  syncProgressFromAudio: () => void;
  syncDurationFromAudio: () => void;
  currentTrack: TrackMeta | null;
  onPlay: () => void;
  onPause: (positionMs?: number) => void | Promise<void>;
  onSeek: (positionMs: number) => Promise<PlaybackSnapshot | null>;
  onPrev: () => void;
  onNext: () => void;
  onCyclePlaybackMode: () => void | Promise<void>;
  queue: QueueItem[];
  tracks: TrackMeta[];
  members?: Array<Pick<RoomMember, "id" | "presenceState">> | null;
  currentSessionId?: string | null;
  currentQueueItemId: string | null;
  nextQueueItemId: string | null;
  canReorderQueue: boolean;
  canRemoveQueue: boolean;
  onPlayQueueItem: (queueItemId: string) => Promise<void>;
  onPlayNextQueueItem: (queueItemId: string) => Promise<void>;
  onRemoveQueueItem: (queueItemId: string) => Promise<void>;
  onRemoveQueueItems?: (queueItemIds: string[]) => Promise<void>;
  onReorderQueue: (queueItemIds: string[]) => Promise<void>;
  desktopLyricsSource?: DesktopLyricsSource;
  onSeekRequestReady?: (requestSeek: ((positionMs: number) => void) | null) => void;
  mobileVariant?: "compact" | "full";
};

function clampProgressMs(progressMs: number, durationMs: number) {
  return durationMs > 0
    ? Math.min(Math.max(0, progressMs), durationMs)
    : Math.max(0, progressMs);
}

function resolveBarrierProgressMs(
  barrier: RoomPlaybackBarrierClock | null | undefined,
  durationMs: number
) {
  if (!barrier) {
    return null;
  }
  const holdPositionMs = barrier.holdPositionMs;
  if (typeof holdPositionMs !== "number" || !Number.isFinite(holdPositionMs)) {
    return null;
  }
  const resumeAtMs = barrier.resumeAtMs;
  const elapsedMs = typeof resumeAtMs === "number" && Number.isFinite(resumeAtMs)
    ? Math.max(0, getRoomPlaybackClockNowMs() - resumeAtMs)
    : 0;
  return clampProgressMs(holdPositionMs + elapsedMs, durationMs);
}

function BottomPlayerBase({
  roomId,
  roomTitle,
  audioRef,
  playback,
  playbackBarrier,
  canControlPlayback,
  canSeekPlayback,
  progressMs,
  seekDraft,
  setSeekDraft,
  audioDurationMs,
  volume,
  setVolume,
  syncProgressFromAudio,
  syncDurationFromAudio,
  currentTrack,
  onPlay,
  onPause,
  onSeek,
  onPrev,
  onNext,
  onCyclePlaybackMode,
  queue,
  tracks,
  members,
  currentSessionId,
  currentQueueItemId,
  nextQueueItemId,
  canReorderQueue,
  canRemoveQueue,
  onPlayQueueItem,
  onPlayNextQueueItem,
  onRemoveQueueItem,
  onRemoveQueueItems,
  onReorderQueue,
  desktopLyricsSource = "local",
  onSeekRequestReady,
  mobileVariant = "compact"
}: BottomPlayerProps) {
  const [isPending, startTransition] = useTransition();
  const [renderedProgressMs, setRenderedProgressMs] = useState(progressMs);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const progressAnchorRef = useRef({
    progressMs,
    receivedAtMs: Date.now()
  });
  const seekCommitTargetRef = useRef<number | null>(null);
  const seekRequestIdRef = useRef(0);
  const [pendingSeek, setPendingSeek] = useState<PendingSeek | null>(null);
  const [isImmersiveOpen, setIsImmersiveOpen] = useState(false);
  const [isMiniOpen, setIsMiniOpen] = useState(false);
  const [miniPlayerWindow, setMiniPlayerWindow] = useState<Window | null>(null);
  const miniPlayerWindowRef = useRef<Window | null>(null);
  const miniPlayerRequestIdRef = useRef(0);
  const closeMiniPlayer = useCallback(() => {
    miniPlayerRequestIdRef.current += 1;
    miniPlayerWindowRef.current?.close();
    miniPlayerWindowRef.current = null;
    setMiniPlayerWindow(null);
    setIsMiniOpen(false);
  }, []);
  const toggleMiniPlayer = useCallback(() => {
    setIsImmersiveOpen(false);
    if (isMiniOpen) {
      closeMiniPlayer();
      return;
    }

    const requestId = miniPlayerRequestIdRef.current + 1;
    miniPlayerRequestIdRef.current = requestId;
    setIsMiniOpen(true);
    void requestMiniPlayerWindow()
      .then((nextWindow) => {
        if (!nextWindow) {
          return;
        }
        if (requestId !== miniPlayerRequestIdRef.current) {
          nextWindow.close();
          return;
        }
        miniPlayerWindowRef.current = nextWindow;
        setMiniPlayerWindow(nextWindow);
      })
      .catch(() => {
        // Keep the in-page fixed fallback when Document PiP is unavailable or denied.
      });
  }, [closeMiniPlayer, isMiniOpen]);

  useEffect(() => {
    return () => {
      miniPlayerWindowRef.current?.close();
    };
  }, []);
  const isPlaybackBarrierBlocked = playbackBarrier?.blocked === true;
  const isPlaying = playback?.status === "playing";
  const playerControlsEnabled = canControlPlayback;
  const currentTrackDuration = audioDurationMs;
  const effectiveProgressMs = Math.max(0, seekDraft ?? renderedProgressMs);
  const boundedProgressMs =
    currentTrackDuration > 0
      ? Math.min(effectiveProgressMs, currentTrackDuration)
      : effectiveProgressMs;
  const title = currentTrack?.title ?? "等待选择歌曲";
  const artist = currentTrack?.artist ?? "从曲库或共享队列中选择一首歌";
  const album = currentTrack?.album ?? "未知专辑";
  const playbackMode = playback?.playbackMode ?? "sequence";
  const artworkUrl = usePreferredArtworkUrl(currentTrack);
  const artworkPalette = useArtworkPalette(artworkUrl);
  const playerStyle = usePlayerStyle();
  const { activeSession } = useSessionIdentity({
    sessionStorageKey: "soqaro-session",
    initialStatusMessage: ""
  });
  usePersonalizationReporter({
    userId: activeSession?.userId ?? null,
    currentTrack,
    isPlaying,
    progressMs: boundedProgressMs
  });
  const favoriteTrack = toFavoriteTrackCandidate(currentTrack);
  const {
    isFavorite: isFavoriteTrack,
    pendingFavoriteKey,
    toggleFavorite: toggleFavoriteTrack
  } = useFavoriteTracks(activeSession?.userId);
  const favoriteTrackIsFavorite = favoriteTrack ? isFavoriteTrack(favoriteTrack) : false;
  const favoriteTrackIsPending = favoriteTrack
    ? pendingFavoriteKey === `${favoriteTrack.provider}:${favoriteTrack.providerTrackId}`
    : false;
  const toggleCurrentFavorite = useCallback(() => {
    if (!favoriteTrack) return;
    void toggleFavoriteTrack(favoriteTrack);
  }, [favoriteTrack, toggleFavoriteTrack]);
  const playerSurfaceStyle = {
    backgroundColor: artworkPalette.surface,
    borderColor: artworkPalette.border
  };
  // 沉浸模式的高频进度推进已移交 ImmersivePlayerOverlay 自驱动,
  // BottomPlayer 本体保持常态节奏,不再以 20fps 整树重渲染。
  const progressRenderIntervalMs = resolveProgressRenderIntervalMs({ isPageVisible });
  const progressCommitThresholdMs = isImmersiveOpen ? 30 : 200;
  const footerClassName =
    "fixed inset-x-2.5 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[80] box-border flex h-14 flex-col justify-center overflow-visible rounded-xl border border-surface-border bg-background-secondary/95 px-2.5 shadow-lg transition-[background-color,border-color,transform,opacity] duration-300 ease-out md:inset-x-0 md:bottom-0 md:h-16 md:rounded-none md:border-x-0 md:border-b-0 md:border-t md:border-surface-border md:bg-background-secondary/95 md:backdrop-blur-xl md:px-0 md:py-0";

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (seekDraft === null) {
      if (isPlaybackBarrierBlocked) {
        progressAnchorRef.current = {
          progressMs: 0,
          receivedAtMs: Date.now()
        };
        setRenderedProgressMs(0);
        return;
      }
      const barrierProgressMs = resolveBarrierProgressMs(playbackBarrier, currentTrackDuration);
      const nextProgressMs = barrierProgressMs ?? progressMs;
      progressAnchorRef.current = {
        progressMs: nextProgressMs,
        receivedAtMs: Date.now()
      };
      setRenderedProgressMs(nextProgressMs);
    }
  }, [currentTrackDuration, isPlaybackBarrierBlocked, isPlaying, playbackBarrier, progressMs, seekDraft]);

  useEffect(() => {
    const hasBarrierClock = resolveBarrierProgressMs(playbackBarrier, currentTrackDuration) !== null;
    if (seekDraft !== null || !isPlaying || (isPlaybackBarrierBlocked && !hasBarrierClock)) {
      return;
    }

    const render = () => {
      const barrierProgressMs = resolveBarrierProgressMs(playbackBarrier, currentTrackDuration);
      const nextProgressMs = barrierProgressMs ?? resolveAnchoredProgressMs({
          progressMs: progressAnchorRef.current.progressMs,
          receivedAtMs: progressAnchorRef.current.receivedAtMs,
          durationMs: currentTrackDuration,
          nowMs: Date.now()
        });
      setRenderedProgressMs((current) =>
        Math.abs(current - nextProgressMs) >= progressCommitThresholdMs ? nextProgressMs : current
      );
    };

    render();
    const timerId = window.setInterval(render, progressRenderIntervalMs);
    return () => {
      window.clearInterval(timerId);
    };
  }, [currentTrackDuration, isPlaybackBarrierBlocked, isPlaying, playbackBarrier, progressCommitThresholdMs, progressRenderIntervalMs, seekDraft]);

  const clearPendingSeek = useCallback(
    (requestId: number) => {
      if (seekRequestIdRef.current !== requestId) {
        return;
      }

      seekCommitTargetRef.current = null;
      setPendingSeek(null);
      setSeekDraft(null);
    },
    [setSeekDraft]
  );

  useEffect(() => {
    if (!pendingSeek) {
      return;
    }

    if (!playback || playback.currentTrackId !== pendingSeek.trackId) {
      clearPendingSeek(pendingSeek.requestId);
      return;
    }

    if (!shouldResolvePendingSeek({ pendingSeek, playback })) {
      return;
    }

    if (isPendingSeekTargetReached({ pendingSeek, playback })) {
      setRenderedProgressMs(clampProgressMs(pendingSeek.targetPositionMs, currentTrackDuration));
      progressAnchorRef.current = {
        progressMs: pendingSeek.targetPositionMs,
        receivedAtMs: Date.now()
      };
    }
    clearPendingSeek(pendingSeek.requestId);
  }, [clearPendingSeek, currentTrackDuration, pendingSeek, playback]);

  const requestSeek = useCallback((requestedPositionMs: number) => {
    if (canSeekPlayback && canControlPlayback) {
      const targetPositionMs = clampProgressMs(requestedPositionMs, currentTrackDuration);
      if (seekCommitTargetRef.current === targetPositionMs) {
        return;
      }
      seekCommitTargetRef.current = targetPositionMs;
      setSeekDraft(targetPositionMs);
      const requestId = seekRequestIdRef.current + 1;
      seekRequestIdRef.current = requestId;
      setPendingSeek({
        requestId,
        trackId: playback?.currentTrackId ?? null,
        targetPositionMs,
        expectedPlaybackRevision: null
      });
      setRenderedProgressMs(targetPositionMs);
      progressAnchorRef.current = {
        progressMs: targetPositionMs,
        receivedAtMs: Date.now()
      };
      startTransition(() => {
        void onSeek(targetPositionMs)
          .then((nextPlayback) => {
            if (seekRequestIdRef.current !== requestId) {
              return;
            }

            if (!nextPlayback) {
              clearPendingSeek(requestId);
              return;
            }

            setPendingSeek((current) =>
              current?.requestId === requestId
                ? {
                    ...current,
                    expectedPlaybackRevision: nextPlayback.playbackRevision
                  }
                : current
            );
          })
          .catch(() => {
            clearPendingSeek(requestId);
          });
      });
    }
  }, [
    canControlPlayback,
    canSeekPlayback,
    clearPendingSeek,
    currentTrackDuration,
    onSeek,
    playback?.currentTrackId,
    setPendingSeek,
    setSeekDraft,
    startTransition
  ]);

  const commitSeek = useCallback(() => {
    if (seekDraft !== null) {
      requestSeek(seekDraft);
    }
  }, [requestSeek, seekDraft]);

  useEffect(() => {
    onSeekRequestReady?.(requestSeek);
    return () => onSeekRequestReady?.(null);
  }, [onSeekRequestReady, requestSeek]);

  const getLiveProgressMs = useCallback(
    () => resolveBarrierProgressMs(playbackBarrier, currentTrackDuration) ?? (
      isPlaybackBarrierBlocked
        ? clampProgressMs(progressAnchorRef.current.progressMs, currentTrackDuration)
        : resolveAnchoredProgressMs({
          progressMs: progressAnchorRef.current.progressMs,
          receivedAtMs: progressAnchorRef.current.receivedAtMs,
          durationMs: currentTrackDuration,
          nowMs: Date.now()
        })
    ),
    [currentTrackDuration, isPlaybackBarrierBlocked, playbackBarrier]
  );

  const togglePlayback = useCallback(() => {
    if (!playerControlsEnabled) return;
    void (isPlaying ? onPause(getLiveProgressMs()) : onPlay());
  }, [getLiveProgressMs, isPlaying, onPause, onPlay, playerControlsEnabled]);

  const playPrev = useCallback(() => {
    if (!playerControlsEnabled) return;
    void onPrev();
  }, [onPrev, playerControlsEnabled]);

  const playNext = useCallback(() => {
    if (!playerControlsEnabled) return;
    void onNext();
  }, [onNext, playerControlsEnabled]);

  const mediaHandlers = {
    onPlay: () => { if (playerControlsEnabled) void onPlay(); },
    onPause: () => { if (playerControlsEnabled) void onPause(getLiveProgressMs()); },
    onToggle: togglePlayback,
    onPrev: playPrev,
    onNext: playNext,
    onSeekTo: requestSeek,
    onSeekBy: (deltaMs: number) => requestSeek(
      (isPlaying ? getLiveProgressMs() : boundedProgressMs) + deltaMs
    ),
    getPositionMs: () => isPlaying ? getLiveProgressMs() : boundedProgressMs
  };
  const mediaHandlersRef = useRef(mediaHandlers);
  mediaHandlersRef.current = mediaHandlers;

  useEffect(() => {
    const cleanup = installBrowserMediaSessionActionHandlers({
      onPlay: () => mediaHandlersRef.current.onPlay(),
      onPause: () => mediaHandlersRef.current.onPause(),
      onToggle: () => mediaHandlersRef.current.onToggle(),
      onPreviousTrack: () => mediaHandlersRef.current.onPrev(),
      onNextTrack: () => mediaHandlersRef.current.onNext(),
      onSeek: (positionMs) => mediaHandlersRef.current.onSeekTo(positionMs),
      getPositionMs: () => mediaHandlersRef.current.getPositionMs()
    });
    return () => {
      cleanup();
      syncBrowserMediaSession({ track: null, playback: null });
    };
  }, []);

  useEffect(() => {
    syncBrowserMediaSession({
      track: currentTrack ? { ...currentTrack, artworkUrl, durationMs: currentTrackDuration } : null,
      playback,
      positionMs: boundedProgressMs
    });
  }, [artworkUrl, boundedProgressMs, currentTrack, currentTrackDuration, playback]);

  const desktopLyrics = useDesktopLyrics();
  const desktopLyricsPlayer = useMemo(() => ({
    source: desktopLyricsSource,
    currentTrack,
    playbackTrackId: playback?.currentTrackId,
    isPlaying,
    progressMs: isPlaying ? getLiveProgressMs() : boundedProgressMs,
    anchorAt: Date.now(),
    artworkUrl,
    canControlPlayback: playerControlsEnabled,
    onPrev: playPrev,
    onTogglePlay: togglePlayback,
    onNext: playNext
  }), [artworkUrl, boundedProgressMs, currentTrack, desktopLyricsSource, getLiveProgressMs, isPlaying, playback?.currentTrackId, playerControlsEnabled, playNext, playPrev, togglePlayback]);
  useDesktopLyricsRegistration(desktopLyricsPlayer);

  // System media surfaces (macOS Now Playing / Linux MPRIS / Android media
  // notification) mirror the active track; commands reuse the same handlers
  // as the on-screen transport and the media-key bridge.
  useSystemMediaTransport({
    roomId,
    roomTitle,
    snapshot: currentTrack
      ? {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album ?? null,
        artworkUrl,
        durationMs: currentTrackDuration,
        positionMs: boundedProgressMs,
        isPlaying: isPlaying === true
      }
      : null,
    handlers: mediaHandlers
  });

  useScreenWakeLock(Boolean(isPlaying));

  const applyVolume = useCallback(
    (nextVolume: number) => {
      const boundedVolume = Math.min(1, Math.max(0, nextVolume));
      setVolume(boundedVolume);
    },
    [setVolume]
  );

  return (
    <>
    <footer
      className={footerClassName}
      style={playerSurfaceStyle}
      data-testid="bottom-player"
      data-mobile-variant={mobileVariant}
      data-custom-layout-item="player"
    >
      <div
        className="relative z-10 flex h-full min-h-0 w-full min-w-0 flex-col justify-center overflow-visible"
        data-custom-layout-player-content="true"
      >
      <MobileBottomPlayerLayout
        roomId={roomId}
        isPlaying={isPlaying}
        canControlPlayback={playerControlsEnabled}
        canSeekPlayback={canSeekPlayback && playerControlsEnabled}
        playbackTrackId={playback?.currentTrackId}
        title={title}
        artist={artist}
        album={album}
        boundedProgressMs={boundedProgressMs}
        currentTrackDuration={currentTrackDuration}
        volume={volume}
        setSeekDraft={setSeekDraft}
        commitSeek={commitSeek}
        applyVolume={applyVolume}
        onPrev={playPrev}
        onNext={playNext}
        onTogglePlay={togglePlayback}
        playbackMode={playbackMode}
        onCyclePlaybackMode={onCyclePlaybackMode}
        queue={queue}
        tracks={tracks}
        members={members}
        currentSessionId={currentSessionId}
        currentQueueItemId={currentQueueItemId}
        nextQueueItemId={nextQueueItemId}
        canReorderQueue={canReorderQueue}
        canRemoveQueue={canRemoveQueue}
        onPlayQueueItem={onPlayQueueItem}
        onPlayNextQueueItem={onPlayNextQueueItem}
        onRemoveQueueItem={onRemoveQueueItem}
        onRemoveQueueItems={onRemoveQueueItems}
        onReorderQueue={onReorderQueue}
        isImmersiveOpen={isImmersiveOpen}
        onToggleImmersive={() => setIsImmersiveOpen((current) => !current)}
        isMiniOpen={isMiniOpen}
        onToggleMini={toggleMiniPlayer}
        isLyricsOpen={desktopLyrics.isOpen}
        onToggleLyrics={desktopLyrics.toggle}
        artworkAccent={artworkPalette.accent}
        artworkAccentSoft={artworkPalette.accentSoft}
        artworkUrl={artworkUrl}
        playerStyle={playerStyle}
        mobileVariant={mobileVariant}
      />
      <DesktopBottomPlayerLayout
        roomId={roomId}
        isPlaying={isPlaying}
        canControlPlayback={playerControlsEnabled}
        canSeekPlayback={canSeekPlayback && playerControlsEnabled}
        playbackTrackId={playback?.currentTrackId}
        title={title}
        artist={artist}
        album={album}
        boundedProgressMs={boundedProgressMs}
        currentTrackDuration={currentTrackDuration}
        volume={volume}
        setSeekDraft={setSeekDraft}
        commitSeek={commitSeek}
        applyVolume={applyVolume}
        onPrev={playPrev}
        onNext={playNext}
        onTogglePlay={togglePlayback}
        playbackMode={playbackMode}
        onCyclePlaybackMode={onCyclePlaybackMode}
        queue={queue}
        tracks={tracks}
        members={members}
        currentSessionId={currentSessionId}
        currentQueueItemId={currentQueueItemId}
        nextQueueItemId={nextQueueItemId}
        canReorderQueue={canReorderQueue}
        canRemoveQueue={canRemoveQueue}
        onPlayQueueItem={onPlayQueueItem}
        onPlayNextQueueItem={onPlayNextQueueItem}
        onRemoveQueueItem={onRemoveQueueItem}
        onRemoveQueueItems={onRemoveQueueItems}
        onReorderQueue={onReorderQueue}
        isImmersiveOpen={isImmersiveOpen}
        onToggleImmersive={() => setIsImmersiveOpen((current) => !current)}
        isMiniOpen={isMiniOpen}
        onToggleMini={toggleMiniPlayer}
        isLyricsOpen={desktopLyrics.isOpen}
        onToggleLyrics={desktopLyrics.toggle}
        artworkAccent={artworkPalette.accent}
        artworkAccentSoft={artworkPalette.accentSoft}
        artworkUrl={artworkUrl}
        playerStyle={playerStyle}
        mobileVariant={mobileVariant}
        favoriteTrack={favoriteTrack}
        favoriteTrackIsFavorite={favoriteTrackIsFavorite}
        favoriteTrackIsPending={favoriteTrackIsPending}
        onToggleFavoriteTrack={toggleCurrentFavorite}
      />
      </div>

      {desktopLyricsSource === "room" ? <audio
        ref={audioRef}
        className="hidden"
        crossOrigin="anonymous"
        playsInline
        // Older iPad Safari versions still consult the prefixed attribute for
        // WebRTC MediaStream playback even when `playsInline` is present.
        webkit-playsinline="true"
        onLoadedMetadata={() => {
          syncDurationFromAudio();
          syncProgressFromAudio();
        }}
        onDurationChange={syncDurationFromAudio}
        onPlay={syncProgressFromAudio}
        onPause={syncProgressFromAudio}
        onSeeked={syncProgressFromAudio}
      /> : null}

      {isPending ? (
        <div className={`${isPlaybackBarrierBlocked ? "" : "animate-fade-in"} absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-surface-border bg-surface px-3 py-1 text-xs text-foreground-muted shadow-lg backdrop-blur-md`}>
          <div className={`h-2 w-2 rounded-full bg-accent ${isPlaybackBarrierBlocked ? "" : "animate-ping"}`} />
          同步中...
        </div>
      ) : null}
    </footer>
    <ImmersivePlayerOverlay
      roomId={roomId}
      isOpen={isImmersiveOpen}
      isPlaying={isPlaying}
      playbackBarrierBlocked={isPlaybackBarrierBlocked}
      positionMs={boundedProgressMs}
      seekDraftMs={seekDraft}
      currentTrack={currentTrack}
      artworkUrl={artworkUrl}
      canControlPlayback={playerControlsEnabled}
      canSeekPlayback={canSeekPlayback && playerControlsEnabled}
      playbackTrackId={playback?.currentTrackId}
      durationMs={currentTrackDuration}
      volume={volume}
      setSeekDraft={setSeekDraft}
      commitSeek={commitSeek}
      applyVolume={applyVolume}
      onPrev={playPrev}
      onNext={playNext}
      onTogglePlay={togglePlayback}
      playbackMode={playbackMode}
      onCyclePlaybackMode={onCyclePlaybackMode}
      queue={queue}
      tracks={tracks}
      members={members}
      currentSessionId={currentSessionId}
      currentQueueItemId={currentQueueItemId}
      nextQueueItemId={nextQueueItemId}
      canReorderQueue={canReorderQueue}
      canRemoveQueue={canRemoveQueue}
      onPlayQueueItem={onPlayQueueItem}
      onPlayNextQueueItem={onPlayNextQueueItem}
      onRemoveQueueItem={onRemoveQueueItem}
      onRemoveQueueItems={onRemoveQueueItems}
      onReorderQueue={onReorderQueue}
      favoriteTrack={favoriteTrack}
      favoriteTrackIsFavorite={favoriteTrackIsFavorite}
      favoriteTrackIsPending={favoriteTrackIsPending}
      onToggleFavoriteTrack={toggleCurrentFavorite}
      onClose={() => setIsImmersiveOpen(false)}
      onSeekToPosition={requestSeek}
    />
    <MiniPlayerOverlay
      isOpen={isMiniOpen}
      isPlaying={isPlaying}
      canControlPlayback={canControlPlayback}
      canSeekPlayback={canSeekPlayback && canControlPlayback}
      playbackTrackId={playback?.currentTrackId}
      title={title}
      artist={artist}
      positionMs={boundedProgressMs}
      durationMs={currentTrackDuration}
      artworkUrl={artworkUrl}
      setSeekDraft={setSeekDraft}
      commitSeek={commitSeek}
      onPrev={playPrev}
      onNext={playNext}
      onTogglePlay={togglePlayback}
      onOpenImmersive={() => {
        closeMiniPlayer();
        setIsImmersiveOpen(true);
      }}
      onClose={closeMiniPlayer}
      pipWindow={miniPlayerWindow}
    />
    </>
  );
}

function toFavoriteTrackCandidate(track: TrackMeta | null): ProviderTrackCandidate | null {
  if (!track?.sourceRef || track.sourceRef.provider === "alist") {
    return null;
  }
  if (track.sourceType !== "netease" && track.sourceType !== "qqmusic" && track.sourceType !== "bilibili") {
    return null;
  }
  return {
    provider: track.sourceRef.provider,
    providerTrackId: track.sourceRef.trackId,
    access: "unknown",
    quality: null,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl
  };
}

export const BottomPlayer = memo(BottomPlayerBase);
