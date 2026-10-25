"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import type { RoomSnapshot } from "@soqaro/shared";
import type {
  PlaybackConnectionKey,
  PlaybackRecoveryAction,
  PlaybackRecoveryDropReason,
  PlaybackRecoveryRecommendation
} from "./room-runtime-types";

const defaultRecoveryActionTtlMs = 8_000;

function getRecoveryActionPriority(actionType: PlaybackRecoveryAction["actionType"]) {
  return actionType === "full-resubscribe" ? 2 : 1;
}

export function resolvePlaybackConnectionKey(input: {
  roomId: string | null | undefined;
  sourcePeerId: string | null | undefined;
  mediaEpoch: number | null | undefined;
  transportEpoch?: number | null | undefined;
}): PlaybackConnectionKey | null {
  if (!input.roomId || !input.sourcePeerId || typeof input.mediaEpoch !== "number") {
    return null;
  }

  return `${input.roomId}|${input.sourcePeerId}|${input.mediaEpoch}`;
}

export function resolvePlaybackRecoveryActionType(
  recommendation: PlaybackRecoveryRecommendation
): PlaybackRecoveryAction["actionType"] | null {
  if (recommendation.scope === "room" || recommendation.level === "full-resubscribe") {
    return "full-resubscribe";
  }

  return recommendation.scope === "data" ? "restart-data-peer" : null;
}

export function resolvePlaybackRecoveryConnectionContext(input: {
  trackedPlaybackConnectionKey: PlaybackConnectionKey | null;
  currentPlaybackConnectionKey: PlaybackConnectionKey | null;
  recommendationPlaybackConnectionKey: PlaybackConnectionKey | null;
}) {
  return {
    activePlaybackConnectionKey: input.currentPlaybackConnectionKey,
    recoveryPlaybackConnectionKey:
      input.recommendationPlaybackConnectionKey ?? input.currentPlaybackConnectionKey,
    shouldResetRecoveryState:
      input.trackedPlaybackConnectionKey !== input.currentPlaybackConnectionKey
  };
}

export function resolvePlaybackRecoveryDropReason(input: {
  playbackConnectionKey: PlaybackConnectionKey | null;
  currentPlaybackConnectionKey: PlaybackConnectionKey | null;
  activeAction: PlaybackRecoveryAction | null;
  nextActionType: PlaybackRecoveryAction["actionType"];
  now?: number;
}): PlaybackRecoveryDropReason | null {
  if (!input.playbackConnectionKey || input.playbackConnectionKey !== input.currentPlaybackConnectionKey) {
    return "stale-connection-key";
  }

  const activeAction = input.activeAction;
  const now = input.now ?? Date.now();
  if (
    activeAction &&
    activeAction.playbackConnectionKey === input.playbackConnectionKey &&
    activeAction.result === "running" &&
    Date.parse(activeAction.expiresAt) > now &&
    getRecoveryActionPriority(activeAction.actionType) >= getRecoveryActionPriority(input.nextActionType)
  ) {
    return "lower-priority-running";
  }

  return null;
}

export function useRoomPlaybackConnectionCoordinator(input: {
  currentRoomRef: MutableRefObject<RoomSnapshot | null>;
}) {
  const playbackConnectionKeyRef = useRef<PlaybackConnectionKey | null>(null);
  const activeRecoveryActionRef = useRef<PlaybackRecoveryAction | null>(null);
  const activeRecoveryActionResultRef = useRef<PlaybackRecoveryAction["result"] | null>(null);
  const lastRecoveryRecommendationRef = useRef<
    (PlaybackRecoveryRecommendation & { recommendedAt: string }) | null
  >(null);
  const lastRecoveryDropReasonRef = useRef<PlaybackRecoveryDropReason | null>(null);
  const recoveryActionSequenceRef = useRef(0);

  const getCurrentPlaybackConnectionKey = useCallback(() => {
    const playback = input.currentRoomRef.current?.room.playback;
    return resolvePlaybackConnectionKey({
      roomId: input.currentRoomRef.current?.room.id ?? null,
      sourcePeerId: playback?.sourcePeerId ?? null,
      mediaEpoch: playback?.mediaEpoch ?? null
    });
  }, [input.currentRoomRef]);

  const beginPlaybackConnection = useCallback((key: PlaybackConnectionKey | null) => {
    if (playbackConnectionKeyRef.current === key) {
      return false;
    }
    playbackConnectionKeyRef.current = key;
    activeRecoveryActionRef.current = null;
    activeRecoveryActionResultRef.current = null;
    lastRecoveryDropReasonRef.current = null;
    return true;
  }, []);

  const disposePlaybackConnection = useCallback((key?: PlaybackConnectionKey | null) => {
    if (typeof key !== "undefined" && key !== playbackConnectionKeyRef.current) {
      return false;
    }
    playbackConnectionKeyRef.current = null;
    activeRecoveryActionRef.current = null;
    activeRecoveryActionResultRef.current = null;
    return true;
  }, []);

  const reportPlaybackState = useCallback(() => true, []);

  const applyRecoveryAction = useCallback(
    (inputAction: {
      playbackConnectionKey: PlaybackConnectionKey | null;
      actionType: PlaybackRecoveryAction["actionType"];
      peerId: string | null;
      reason: string;
      expiresInMs?: number;
    }) => {
      const now = Date.now();
      const connectionContext = resolvePlaybackRecoveryConnectionContext({
        trackedPlaybackConnectionKey: playbackConnectionKeyRef.current,
        currentPlaybackConnectionKey: getCurrentPlaybackConnectionKey(),
        recommendationPlaybackConnectionKey: inputAction.playbackConnectionKey
      });
      if (connectionContext.shouldResetRecoveryState) {
        playbackConnectionKeyRef.current = connectionContext.activePlaybackConnectionKey;
        activeRecoveryActionRef.current = null;
        activeRecoveryActionResultRef.current = null;
        lastRecoveryDropReasonRef.current = null;
      }
      const dropReason = resolvePlaybackRecoveryDropReason({
        playbackConnectionKey: connectionContext.recoveryPlaybackConnectionKey,
        currentPlaybackConnectionKey: connectionContext.activePlaybackConnectionKey,
        activeAction: activeRecoveryActionRef.current,
        nextActionType: inputAction.actionType,
        now
      });
      if (dropReason) {
        lastRecoveryDropReasonRef.current = dropReason;
        return null;
      }
      const playbackConnectionKey =
        connectionContext.recoveryPlaybackConnectionKey as PlaybackConnectionKey;

      const action: PlaybackRecoveryAction = {
        actionId: `playback-recovery-${++recoveryActionSequenceRef.current}`,
        playbackConnectionKey,
        actionType: inputAction.actionType,
        peerId: inputAction.peerId,
        startedAt: new Date(now).toISOString(),
        expiresAt: new Date(
          now + (inputAction.expiresInMs ?? defaultRecoveryActionTtlMs)
        ).toISOString(),
        result: "running",
        reason: inputAction.reason
      };
      activeRecoveryActionRef.current = action;
      activeRecoveryActionResultRef.current = "running";
      lastRecoveryDropReasonRef.current = null;
      return action;
    },
    [getCurrentPlaybackConnectionKey]
  );

  const finishRecoveryAction = useCallback(
    (actionId: string, result: PlaybackRecoveryAction["result"]) => {
      const activeAction = activeRecoveryActionRef.current;
      if (!activeAction || activeAction.actionId !== actionId) {
        return false;
      }

      activeRecoveryActionRef.current = result === "running"
        ? { ...activeAction, result }
        : null;
      activeRecoveryActionResultRef.current = result;
      return true;
    },
    []
  );

  const noteRecoveryRecommendation = useCallback((recommendation: PlaybackRecoveryRecommendation) => {
    lastRecoveryRecommendationRef.current = {
      ...recommendation,
      recommendedAt: new Date().toISOString()
    };
  }, []);

  return {
    playbackConnectionKeyRef,
    listenerPlaybackStateRef: useRef("idle"),
    activeRecoveryActionRef,
    activeRecoveryActionResultRef,
    lastRecoveryRecommendationRef,
    lastRecoveryDropReasonRef,
    getCurrentPlaybackConnectionKey,
    beginPlaybackConnection,
    disposePlaybackConnection,
    reportPlaybackState,
    applyRecoveryAction,
    finishRecoveryAction,
    noteRecoveryRecommendation
  };
}
