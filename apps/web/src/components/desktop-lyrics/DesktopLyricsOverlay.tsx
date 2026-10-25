"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DesktopLyricsBar } from "./DesktopLyricsBar";
import { isCapacitorRuntime, isTauriRuntime } from "@/lib/desktop/tauri";
import { useDesktopLyrics, getDesktopLyricsPositionStorageKey } from "@/features/playback/desktop-lyrics-context";
import { useTrackLyricsOffset } from "@/features/playback/lyrics-offset-store";

type Position = { x: number; y: number };

/**
 * In-app floating desktop lyrics bar (web + Capacitor mobile).
 * Pixel-perfect drag positioning with boundary protection and position persistence.
 */
export function DesktopLyricsOverlay() {
  const {
    isOpen,
    close,
    activePlayer,
    lyrics,
    showTranslation,
    showRomanized,
    toggleTranslation,
    toggleRomanized
  } = useDesktopLyrics();
  const [position, setPosition] = useState<Position | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialLeft: number;
    initialTop: number;
    moved: boolean;
  } | null>(null);
  const positionRef = useRef<Position | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Load saved position from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(getDesktopLyricsPositionStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Position>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        Number.isFinite(parsed.x) &&
        Number.isFinite(parsed.y)
      ) {
        const clampedX = Math.max(8, Math.min(window.innerWidth - 120, parsed.x));
        const clampedY = Math.max(8, Math.min(window.innerHeight - 60, parsed.y));
        const validPos = { x: clampedX, y: clampedY };
        positionRef.current = validPos;
        setPosition(validPos);
      }
    } catch {
      // Ignore malformed storage
    }
  }, []);

  // Window resize handler: keep bar within viewport
  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        if (!current) return null;
        const panel = panelRef.current;
        const width = panel?.offsetWidth ?? 320;
        const height = panel?.offsetHeight ?? 60;
        const clampedX = Math.max(8, Math.min(window.innerWidth - width - 8, current.x));
        const clampedY = Math.max(8, Math.min(window.innerHeight - height - 8, current.y));
        return { x: clampedX, y: clampedY };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const trackKey = activePlayer?.playbackTrackId || activePlayer?.currentTrack?.id;
  const { offsetMs } = useTrackLyricsOffset(trackKey);

  if (isTauriRuntime() || isCapacitorRuntime()) return null;
  if (!isOpen || !activePlayer) return null;

  const canControl = activePlayer.canControlPlayback && Boolean(activePlayer.playbackTrackId);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialLeft: rect.left,
      initialTop: rect.top,
      moved: false
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (!drag.moved) {
        drag.moved = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignored
        }
      }
    }
    if (!drag.moved) return;

    const newLeft = drag.initialLeft + dx;
    const newTop = drag.initialTop + dy;

    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 320;
    const height = panel?.offsetHeight ?? 60;
    const clampedX = Math.max(8, Math.min(window.innerWidth - width - 8, newLeft));
    const clampedY = Math.max(8, Math.min(window.innerHeight - height - 8, newTop));

    const next = { x: clampedX, y: clampedY };
    positionRef.current = next;
    setPosition(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.moved && positionRef.current) {
      try {
        window.localStorage.setItem(getDesktopLyricsPositionStorageKey(), JSON.stringify(positionRef.current));
      } catch {
        // Storage may be restricted
      }
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const panelPositionStyle = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: "auto",
        right: "auto",
        transform: "none"
      }
    : undefined;

  return (
    <div
      ref={panelRef}
      aria-label="桌面歌词"
      className={`fixed z-[120] select-none touch-none w-[min(92vw,48rem)] ${
        position
          ? ""
          : "left-1/2 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] md:bottom-[5.75rem] -translate-x-1/2"
      }`}
      data-testid="desktop-lyrics-overlay"
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={panelPositionStyle}
    >
      <div className="h-16 md:h-20 w-full">
        <DesktopLyricsBar
          title={activePlayer.currentTrack?.title ?? "等待选择歌曲"}
          artist={activePlayer.currentTrack?.artist}
          artworkUrl={activePlayer.artworkUrl ?? (activePlayer.currentTrack?.artworkUrl ?? null)}
          durationMs={activePlayer.currentTrack?.durationMs}
          canControl={canControl}
          isPlaying={activePlayer.isPlaying}
          plainLyric={lyrics.plainLyric}
          wordSyncedLyric={lyrics.wordSyncedLyric}
          translatedLyric={lyrics.translatedLyric}
          romanizedLyric={lyrics.romanizedLyric}
          showTranslation={showTranslation}
          showRomanized={showRomanized}
          offsetMs={offsetMs}
          onToggleTranslation={toggleTranslation}
          onToggleRomanized={toggleRomanized}
          anchorAt={activePlayer.anchorAt}
          onClose={close}
          onNext={activePlayer.onNext}
          onPrev={activePlayer.onPrev}
          onTogglePlay={activePlayer.onTogglePlay}
          progressMs={activePlayer.progressMs}
          status={lyrics.status}
        />
      </div>
    </div>
  );
}
