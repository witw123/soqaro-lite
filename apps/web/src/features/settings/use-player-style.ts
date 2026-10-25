"use client";

import { useAppSettings, type PlayerStyle } from "./settings-store";

export function usePlayerStyle(): PlayerStyle {
  return useAppSettings((s) => s.playback.playerStyle);
}
