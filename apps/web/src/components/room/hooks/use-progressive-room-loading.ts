"use client";

import { useEffect, useState } from "react";

export interface ProgressiveRoomLoadingState {
  stageReady: boolean;
  panelsReady: boolean;
  phase: number;
}

export function useProgressiveRoomLoading(): ProgressiveRoomLoadingState {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Phase 1: Mount stage visuals and canvas after initial paint (~20ms)
    const stageTimer = setTimeout(() => {
      setPhase((prev) => Math.max(prev, 1));
    }, 20);

    // Phase 2: Mount heavy panels and track lists on idle frame (~100ms)
    let idleId: number | null = null;
    let panelTimer: ReturnType<typeof setTimeout> | null = null;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(
        () => {
          setPhase(2);
        },
        { timeout: 140 }
      );
    } else {
      panelTimer = setTimeout(() => {
        setPhase(2);
      }, 100);
    }

    return () => {
      clearTimeout(stageTimer);
      if (panelTimer) clearTimeout(panelTimer);
      if (idleId && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        (
          window as unknown as {
            cancelIdleCallback: (id: number) => void;
          }
        ).cancelIdleCallback(idleId);
      }
    };
  }, []);

  return {
    stageReady: phase >= 1,
    panelsReady: phase >= 2,
    phase
  };
}
