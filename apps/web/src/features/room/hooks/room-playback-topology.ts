"use client";

import type { PlaybackSnapshot } from "@soqaro/shared";

export type RoomRealtimeEventKind =
  | "snapshot"
  | "playback"
  | "queue"
  | "presence"
  | "library";

export type RoomChangeKind =
  | "presence-only"
  | "catalog-only"
  | "playback-control"
  | "playback-timeline"
  | "playback-topology"
  | "transport-topology";

export type SourceResetReason =
  | "track-changed"
  | "source-session-changed"
  | "source-peer-changed"
  | "media-epoch-changed"
  | "playback-stopped"
  | "none";

type PlaybackLike = PlaybackSnapshot | null | undefined;
type PlaybackTopologyLike =
  | {
      currentTrackId: string | null | undefined;
      mediaEpoch?: number | null;
      sourcePeerId?: string | null;
      sourceSessionId?: string | null;
    }
  | null
  | undefined;

export function resolvePlaybackSurfaceKey(playback: PlaybackLike) {
  if (!playback?.currentTrackId) {
    return null;
  }

  const sourceIdentity = playback.sourceSessionId ?? playback.sourcePeerId ?? "none";
  const mediaEpoch = typeof playback.mediaEpoch === "number" ? playback.mediaEpoch : "none";
  return [playback.currentTrackId, sourceIdentity, mediaEpoch].join("|");
}

export function resolvePlaybackTimelineKey(playback: PlaybackLike) {
  if (!playback?.currentTrackId) {
    return null;
  }

  const mediaEpoch = typeof playback.mediaEpoch === "number" ? playback.mediaEpoch : "none";
  return [
    playback.currentTrackId,
    mediaEpoch,
    playback.startAt ?? playback.startedAt ?? "stopped",
    playback.status
  ].join("|");
}

export function resolvePlaybackSourceResetReason(input: {
  previousPlayback: PlaybackTopologyLike;
  nextPlayback: PlaybackTopologyLike;
}): SourceResetReason {
  const { previousPlayback, nextPlayback } = input;

  if (!nextPlayback?.currentTrackId) {
    return previousPlayback?.currentTrackId ? "playback-stopped" : "none";
  }

  if (!previousPlayback) {
    return "track-changed";
  }

  if (previousPlayback.currentTrackId !== nextPlayback.currentTrackId) {
    return "track-changed";
  }

  if (previousPlayback.sourceSessionId !== nextPlayback.sourceSessionId) {
    return "source-session-changed";
  }

  if (previousPlayback.sourcePeerId !== nextPlayback.sourcePeerId) {
    return "source-peer-changed";
  }

  if (previousPlayback.mediaEpoch !== nextPlayback.mediaEpoch) {
    return "media-epoch-changed";
  }

  return "none";
}

export function classifyRoomPlaybackChange(input: {
  eventKind: RoomRealtimeEventKind;
  previousPlayback: PlaybackLike;
  nextPlayback: PlaybackLike;
  previousTransportEpoch?: number | null;
  nextTransportEpoch?: number | null;
}): RoomChangeKind {
  const { eventKind, previousPlayback, nextPlayback, previousTransportEpoch, nextTransportEpoch } =
    input;

  if (
    typeof previousTransportEpoch === "number" &&
    typeof nextTransportEpoch === "number" &&
    previousTransportEpoch !== nextTransportEpoch
  ) {
    return "transport-topology";
  }

  const sourceResetReason = resolvePlaybackSourceResetReason({
    previousPlayback,
    nextPlayback
  });
  if (sourceResetReason !== "none") {
    return "playback-topology";
  }

  if (!previousPlayback || !nextPlayback) {
    return eventKind === "presence" ? "presence-only" : "catalog-only";
  }

  const isPlaybackModeOnlyChange =
    previousPlayback.playbackMode !== nextPlayback.playbackMode &&
    previousPlayback.status === nextPlayback.status &&
    previousPlayback.currentTrackId === nextPlayback.currentTrackId &&
    previousPlayback.currentQueueItemId === nextPlayback.currentQueueItemId &&
    previousPlayback.startAt === nextPlayback.startAt &&
    previousPlayback.startedAt === nextPlayback.startedAt &&
    previousPlayback.positionMs === nextPlayback.positionMs &&
    previousPlayback.mediaEpoch === nextPlayback.mediaEpoch;
  if (isPlaybackModeOnlyChange) {
    return "playback-control";
  }

  if (
    previousPlayback.status !== nextPlayback.status ||
    previousPlayback.positionMs !== nextPlayback.positionMs ||
    previousPlayback.startedAt !== nextPlayback.startedAt ||
    previousPlayback.playbackRevision !== nextPlayback.playbackRevision
  ) {
    return "playback-timeline";
  }

  switch (eventKind) {
    case "presence":
      return "presence-only";
    case "queue":
    case "library":
      return "catalog-only";
    case "snapshot":
      return "catalog-only";
    case "playback":
    default:
      return "playback-timeline";
  }
}
