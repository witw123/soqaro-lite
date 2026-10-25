"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopLyricsBar } from "@/components/desktop-lyrics/DesktopLyricsBar";
import { invokeTauri } from "@/lib/desktop/tauri";
import { appSettingsChangeEvent, appSettingsStorageKey, getAppSettings, updateAppSettings } from "@/features/settings/settings-store";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Player state snapshot bridged from the main window over BroadcastChannel.
 * Also mirrored into localStorage so a freshly opened lyrics window renders
 * the current track immediately instead of waiting for the next tick.
 */
type BridgeState = {
  track: {
    title: string;
    artist: string;
    artworkUrl: string | null;
    durationMs?: number | null;
    plainLyric: string | null;
    wordSyncedLyric?: string | null;
    translatedLyric?: string | null;
    romanizedLyric?: string | null;
  } | null;
  progressMs: number;
  anchorAt: number;
  isPlaying: boolean;
  canControl: boolean;
  showTranslation?: boolean;
  showRomanized?: boolean;
};

const bridgeChannelName = "soqaro-desktop-lyrics";
const bridgeSnapshotKey = "soqaro-desktop-lyrics-snapshot";
const emptyState: BridgeState = {
  track: null,
  progressMs: 0,
  anchorAt: Date.now(),
  isPlaying: false,
  canControl: false,
  showTranslation: true,
  showRomanized: false
};

type ResizeGesture = {
  edge: "west" | "east" | "north" | "south" | "northwest" | "northeast" | "southwest" | "southeast";
  startScreenX: number;
  startScreenY: number;
  startWidth: number;
  startHeight: number;
};

const resizeEdgePx = 14;
const minWidth = 360;
const minHeight = 68;
const maxWidth = 2400;
const maxHeight = 500;

function readSnapshot(): BridgeState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(bridgeSnapshotKey);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<BridgeState>;
    if (!parsed || typeof parsed !== "object") return emptyState;
    return {
      track: parsed.track ?? null,
      progressMs: typeof parsed.progressMs === "number" ? parsed.progressMs : 0,
      anchorAt: typeof parsed.anchorAt === "number"
        ? parsed.anchorAt
        : typeof (parsed as { at?: number }).at === "number"
          ? (parsed as { at?: number }).at!
          : Date.now(),
      isPlaying: parsed.isPlaying === true,
      canControl: parsed.canControl === true,
      showTranslation: parsed.showTranslation !== false,
      showRomanized: parsed.showRomanized === true
    };
  } catch {
    return emptyState;
  }
}

function pickResizeEdge(event: { clientX: number; clientY: number }): ResizeGesture["edge"] | null {
  const nearLeft = event.clientX <= resizeEdgePx;
  const nearRight = event.clientX >= window.innerWidth - resizeEdgePx;
  const nearTop = event.clientY <= resizeEdgePx;
  const nearBottom = event.clientY >= window.innerHeight - resizeEdgePx;
  if (nearLeft && nearTop) return "northwest";
  if (nearRight && nearTop) return "northeast";
  if (nearLeft && nearBottom) return "southwest";
  if (nearRight && nearBottom) return "southeast";
  if (nearLeft) return "west";
  if (nearRight) return "east";
  if (nearTop) return "north";
  if (nearBottom) return "south";
  return null;
}

export function DesktopLyricsWindowApp() {
  const [state, setState] = useState<BridgeState>(readSnapshot);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const resizeGestureRef = useRef<ResizeGesture | null>(null);
  const pendingSizeRef = useRef<{ width: number; height: number } | null>(null);
  const sizeRafRef = useRef(0);
  const lastScaleRef = useRef<number | null>(null);

  // Sync window size with desktopLyricScale setting ONLY when scale actually changes
  useEffect(() => {
    const syncScale = (event?: StorageEvent | Event) => {
      if (event && "key" in event && event.key && event.key !== appSettingsStorageKey) {
        return; // Ignore bridge snapshot writes, only react to real settings changes
      }
      const scale = getAppSettings().playback.desktopLyricScale;
      if (lastScaleRef.current === scale) return;
      lastScaleRef.current = scale;
      void invokeTauri("set_desktop_lyrics_size", {
        width: Math.round(860 * scale),
        height: Math.round(96 * scale)
      });
    };
    syncScale();
    window.addEventListener(appSettingsChangeEvent, syncScale);
    window.addEventListener("storage", syncScale);
    return () => {
      window.removeEventListener(appSettingsChangeEvent, syncScale);
      window.removeEventListener("storage", syncScale);
    };
  }, []);

  useEffect(() => {
    const isMacintosh = /Macintosh|Mac OS X/.test(navigator.userAgent);
    const background = isMacintosh ? "#0c0e13" : "transparent";
    document.documentElement.style.background = background;
    document.body.style.background = background;
    document.documentElement.dataset.lyricsWindow = "true";
    document.body.dataset.lyricsWindow = "true";
    document.body.style.overflow = "hidden";

    const channel = new BroadcastChannel(bridgeChannelName);
    channel.onmessage = (event) => {
      const data = event.data as Partial<BridgeState> & { type?: string; at?: number; anchorAt?: number } | null;
      if (!data || data.type !== "state") return;
      const anchorAt = typeof data.anchorAt === "number"
        ? data.anchorAt
        : typeof data.at === "number"
          ? data.at
          : Date.now();
      setState((prev) => ({
        track: data.track !== undefined ? data.track : prev.track,
        progressMs: typeof data.progressMs === "number" ? data.progressMs : prev.progressMs,
        anchorAt,
        isPlaying: data.isPlaying !== undefined ? data.isPlaying === true : prev.isPlaying,
        canControl: data.canControl !== undefined ? data.canControl === true : prev.canControl,
        showTranslation: data.showTranslation !== undefined ? data.showTranslation : prev.showTranslation,
        showRomanized: data.showRomanized !== undefined ? data.showRomanized : prev.showRomanized
      }));
    };
    channelRef.current = channel;
    return () => {
      channel.onmessage = null;
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const postCommand = useCallback((action: "prev" | "toggle" | "next" | "toggleTranslation" | "toggleRomanized" | "close", extra?: Record<string, unknown>) => {
    channelRef.current?.postMessage({ type: "command", action, ...extra });
  }, []);

  const dragDetectionRef = useRef<{ startX: number; startY: number } | null>(null);

  const handleBarPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const edge = pickResizeEdge(event);
    if (edge) {
      resizeGestureRef.current = {
        edge,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        startWidth: window.innerWidth,
        startHeight: window.innerHeight
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    dragDetectionRef.current = {
      startX: event.screenX,
      startY: event.screenY
    };
  }, []);

  const handleBarPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragDetectionRef.current) return;
    const dx = event.screenX - dragDetectionRef.current.startX;
    const dy = event.screenY - dragDetectionRef.current.startY;
    if (Math.hypot(dx, dy) > 5) {
      dragDetectionRef.current = null;
      void invokeTauri("drag_desktop_lyrics_window");
    }
  }, []);

  const handleBarPointerUp = useCallback(() => {
    dragDetectionRef.current = null;
  }, []);

  useEffect(() => {
    const flushPendingSize = () => {
      const pending = pendingSizeRef.current;
      if (!pending) return;
      pendingSizeRef.current = null;
      sizeRafRef.current = 0;
      void invokeTauri("set_desktop_lyrics_size", pending);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const gesture = resizeGestureRef.current;
      if (!gesture) return;
      let width = gesture.startWidth;
      let height = gesture.startHeight;
      const dx = event.screenX - gesture.startScreenX;
      const dy = event.screenY - gesture.startScreenY;
      if (gesture.edge.includes("east")) width = gesture.startWidth + dx;
      if (gesture.edge.includes("west")) width = gesture.startWidth - dx;
      if (gesture.edge.includes("south")) height = gesture.startHeight + dy;
      if (gesture.edge.includes("north")) height = gesture.startHeight - dy;
      pendingSizeRef.current = {
        width: Math.min(maxWidth, Math.max(minWidth, width)),
        height: Math.min(maxHeight, Math.max(minHeight, height))
      };
      if (!sizeRafRef.current) {
        sizeRafRef.current = window.requestAnimationFrame(flushPendingSize);
      }
    };
    const handlePointerUp = () => {
      resizeGestureRef.current = null;
      if (sizeRafRef.current) {
        window.cancelAnimationFrame(sizeRafRef.current);
        sizeRafRef.current = 0;
      }
      flushPendingSize();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const canControl = state.canControl;
  const track = state.track;

  return (
    <main
      className="flex h-[calc(100*var(--app-dvh))] w-full items-center p-1.5 overflow-hidden"
      data-testid="desktop-lyrics-window"
      onPointerDown={handleBarPointerDown}
      onPointerMove={handleBarPointerMove}
      onPointerUp={handleBarPointerUp}
      onPointerCancel={handleBarPointerUp}
    >
      <div className="h-full w-full">
        <DesktopLyricsBar
          title={track?.title ?? "等待选择歌曲"}
          artist={track?.artist}
          artworkUrl={track?.artworkUrl ?? null}
          durationMs={track?.durationMs}
          canControl={canControl}
          isPlaying={state.isPlaying}
          plainLyric={track?.plainLyric ?? null}
          wordSyncedLyric={track?.wordSyncedLyric ?? null}
          translatedLyric={track?.translatedLyric ?? null}
          romanizedLyric={track?.romanizedLyric ?? null}
          showTranslation={state.showTranslation}
          showRomanized={state.showRomanized}
          onToggleTranslation={() => {
            const next = !state.showTranslation;
            setState((prev) => ({ ...prev, showTranslation: next }));
            postCommand("toggleTranslation");
          }}
          onToggleRomanized={() => {
            const next = !state.showRomanized;
            setState((prev) => ({ ...prev, showRomanized: next }));
            postCommand("toggleRomanized");
          }}
          onScaleChange={(scale) => {
            updateAppSettings({ playback: { desktopLyricScale: scale } });
            channelRef.current?.postMessage({ type: "command", action: "setScale", scale });
          }}
          anchorAt={state.anchorAt}
          onClose={() => {
            postCommand("close");
            void invokeTauri("hide_desktop_lyrics_window");
          }}
          onPointerDown={handleBarPointerDown}
          onNext={() => postCommand("next")}
          onPrev={() => postCommand("prev")}
          onTogglePlay={() => postCommand("toggle")}
          progressMs={state.progressMs}
          status={track ? "ready" : "idle"}
        />
      </div>
    </main>
  );
}
