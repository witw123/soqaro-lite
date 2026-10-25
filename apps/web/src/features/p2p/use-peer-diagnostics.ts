"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PeerDiagnosticsSnapshot, PeerRecentEvent } from "@soqaro/shared";
import { createEmptyDiagnosticsState, recordDiagnosticsEvent } from "./diagnostics";

export type PeerDiagnosticInput = Parameters<typeof recordDiagnosticsEvent>[1];
export type PeerDiagnosticRecorder = (input: PeerDiagnosticInput) => void;

type UsePeerDiagnosticsOptions = {
  highFrequencyEnabled?: boolean;
  highFrequencyFlushDelayMs?: number;
  lowFrequencyFlushDelayMs?: number;
};

export function usePeerDiagnostics(options: UsePeerDiagnosticsOptions = {}) {
  const highFrequencyEnabled = options.highFrequencyEnabled ?? false;
  const highFrequencyFlushDelayMs = options.highFrequencyFlushDelayMs ?? 240;
  const lowFrequencyFlushDelayMs = options.lowFrequencyFlushDelayMs ?? 1_200;
  const flushDelayMs = highFrequencyEnabled ? highFrequencyFlushDelayMs : lowFrequencyFlushDelayMs;
  const highFrequencyEnabledRef = useRef(highFrequencyEnabled);
  const flushDelayMsRef = useRef(flushDelayMs);
  const queuedDiagnosticsRef = useRef<PeerDiagnosticInput[]>([]);
  const diagnosticsFlushTimerRef = useRef<number | null>(null);
  const [diagnosticsState, setDiagnosticsState] = useState(createEmptyDiagnosticsState);

  const peerDiagnostics = useMemo<PeerDiagnosticsSnapshot[]>(
    () =>
      Object.values(diagnosticsState.peers).sort((left, right) =>
        left.peerId.localeCompare(right.peerId)
      ),
    [diagnosticsState.peers]
  );
  const peerRecentEvents = diagnosticsState.recentEvents as PeerRecentEvent[];

  const flushQueuedDiagnostics = useCallback(() => {
    if (diagnosticsFlushTimerRef.current !== null) {
      window.clearTimeout(diagnosticsFlushTimerRef.current);
      diagnosticsFlushTimerRef.current = null;
    }

    if (queuedDiagnosticsRef.current.length === 0) {
      return;
    }

    const queued = queuedDiagnosticsRef.current.splice(0, queuedDiagnosticsRef.current.length);
    setDiagnosticsState((current) =>
      queued.reduce((state, input) => recordDiagnosticsEvent(state, input), current)
    );
  }, []);

  const recordPeerDiagnostic = useCallback(
    (input: PeerDiagnosticInput) => {
      queuedDiagnosticsRef.current.push(input);
      if (diagnosticsFlushTimerRef.current !== null) {
        return;
      }

      diagnosticsFlushTimerRef.current = window.setTimeout(() => {
        flushQueuedDiagnostics();
      }, flushDelayMsRef.current);
    },
    [flushQueuedDiagnostics]
  );

  useEffect(() => {
    highFrequencyEnabledRef.current = highFrequencyEnabled;
    flushDelayMsRef.current = flushDelayMs;
  }, [flushDelayMs, highFrequencyEnabled]);

  useEffect(() => {
    if (queuedDiagnosticsRef.current.length === 0) {
      return;
    }

    if (diagnosticsFlushTimerRef.current !== null) {
      window.clearTimeout(diagnosticsFlushTimerRef.current);
      diagnosticsFlushTimerRef.current = null;
    }

    if (highFrequencyEnabledRef.current) {
      flushQueuedDiagnostics();
      return;
    }

    diagnosticsFlushTimerRef.current = window.setTimeout(() => {
      flushQueuedDiagnostics();
    }, flushDelayMsRef.current);
  }, [flushDelayMs, flushQueuedDiagnostics, highFrequencyEnabled]);

  const resetPeerDiagnostics = useCallback(() => {
    if (diagnosticsFlushTimerRef.current !== null) {
      window.clearTimeout(diagnosticsFlushTimerRef.current);
      diagnosticsFlushTimerRef.current = null;
    }

    queuedDiagnosticsRef.current = [];
    setDiagnosticsState(createEmptyDiagnosticsState());
  }, []);

  useEffect(() => {
    return () => {
      if (diagnosticsFlushTimerRef.current !== null) {
        window.clearTimeout(diagnosticsFlushTimerRef.current);
      }
    };
  }, []);

  return {
    diagnosticsState,
    peerDiagnostics,
    peerRecentEvents,
    recordPeerDiagnostic,
    resetPeerDiagnostics
  };
}
