"use client";

import { useEffect, useState } from "react";

export const lyricsOffsetStorageKey = "soqaro-lyrics-offsets-v1";
export const lyricsOffsetChangeEvent = "soqaro-lyrics-offset-change";

export const MAX_LYRICS_OFFSET_MS = 10000;
export const MIN_LYRICS_OFFSET_MS = -10000;
export const LYRICS_OFFSET_STEP_MS = 500;

type LyricsOffsetMap = Record<string, number>;

let inMemoryOffsets: LyricsOffsetMap | null = null;

function loadStoredOffsets(): LyricsOffsetMap {
  if (typeof window === "undefined") return {};
  if (inMemoryOffsets) return inMemoryOffsets;
  try {
    const raw = window.localStorage.getItem(lyricsOffsetStorageKey);
    if (!raw) {
      inMemoryOffsets = {};
      return inMemoryOffsets;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      inMemoryOffsets = parsed as LyricsOffsetMap;
      return inMemoryOffsets;
    }
  } catch {
    // Ignore JSON parse errors
  }
  inMemoryOffsets = {};
  return inMemoryOffsets;
}

function persistOffsets(map: LyricsOffsetMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lyricsOffsetStorageKey, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function getTrackLyricsOffset(trackKey: string | null | undefined): number {
  if (!trackKey) return 0;
  const map = loadStoredOffsets();
  const val = map[trackKey];
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

export function setTrackLyricsOffset(trackKey: string | null | undefined, offsetMs: number): void {
  if (!trackKey) return;
  const clamped = Math.max(MIN_LYRICS_OFFSET_MS, Math.min(MAX_LYRICS_OFFSET_MS, Math.round(offsetMs)));
  const map = { ...loadStoredOffsets() };
  if (clamped === 0) {
    delete map[trackKey];
  } else {
    map[trackKey] = clamped;
  }
  inMemoryOffsets = map;
  persistOffsets(map);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(lyricsOffsetChangeEvent, { detail: { trackKey, offsetMs: clamped } }));
  }
}

export function resetTrackLyricsOffset(trackKey: string | null | undefined): void {
  setTrackLyricsOffset(trackKey, 0);
}

export function useTrackLyricsOffset(trackKey: string | null | undefined) {
  const [offsetMs, setOffsetState] = useState<number>(() => getTrackLyricsOffset(trackKey));

  useEffect(() => {
    setOffsetState(getTrackLyricsOffset(trackKey));

    if (typeof window === "undefined" || !trackKey) return;

    const handleEvent = (event: Event) => {
      const custom = event as CustomEvent<{ trackKey?: string; offsetMs?: number }>;
      if (!custom.detail || custom.detail.trackKey === trackKey) {
        setOffsetState(getTrackLyricsOffset(trackKey));
      }
    };

    window.addEventListener(lyricsOffsetChangeEvent, handleEvent);
    return () => {
      window.removeEventListener(lyricsOffsetChangeEvent, handleEvent);
    };
  }, [trackKey]);

  const setOffset = (val: number) => {
    setTrackLyricsOffset(trackKey, val);
    setOffsetState(val);
  };

  const adjustOffset = (deltaMs: number) => {
    const current = getTrackLyricsOffset(trackKey);
    const next = current + deltaMs;
    setOffset(next);
  };

  const resetOffset = () => {
    resetTrackLyricsOffset(trackKey);
    setOffsetState(0);
  };

  return {
    offsetMs,
    setOffset,
    adjustOffset,
    resetOffset
  };
}
