"use client";

import { useEffect, useRef } from "react";
import type { ProviderTrackCandidate, QueueItem, RoomSnapshot, TrackMeta } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { recordPersonalizationFavoriteCandidate, toPersonalizationTrack } from "@/features/personalization/use-personalization-reporter";

type FavoriteTracksChangedDetail = {
  userId: string;
  track: ProviderTrackCandidate;
  isFavorite: boolean;
};

type PlaybackSession = {
  queueItemId: string;
  mediaEpoch: number;
  track: TrackMeta;
  durationMs: number;
  maxProgressMs: number;
  wasPlaying: boolean;
  completed: boolean;
};

type QueueSnapshot = {
  queue: QueueItem[];
  tracks: TrackMeta[];
};

export function useRadioRecommendationFeedback(input: {
  activeUserId: string | null;
  roomSnapshot: RoomSnapshot | null;
  progressMs: number;
  isPlaying: boolean;
}) {
  const previousQueueRef = useRef<QueueSnapshot | null>(null);
  const playbackRef = useRef<PlaybackSession | null>(null);
  const isRadioHost = input.roomSnapshot?.room.roomType === "radio" &&
    input.roomSnapshot.room.hostId === input.activeUserId;
  const roomId = input.roomSnapshot?.room.id ?? null;
  const contextKey = roomId ? `radio:${roomId}` : null;

  useEffect(() => {
    if (!isRadioHost || !input.activeUserId || !input.roomSnapshot || !contextKey) {
      previousQueueRef.current = null;
      return;
    }

    const previous = previousQueueRef.current;
    const current = input.roomSnapshot;
    if (previous) {
      const previousQueueIds = new Set(previous.queue.map((item) => item.id));
      const currentQueueIds = new Set(current.queue.map((item) => item.id));
      const currentTracks = new Map(current.tracks.map((track) => [track.id, track]));
      const previousTracks = new Map(previous.tracks.map((track) => [track.id, track]));

      for (const queueItem of current.queue) {
        if (previousQueueIds.has(queueItem.id) || queueItem.source !== "manual") continue;
        if (queueItem.requestedById !== input.activeUserId) continue;
        const candidate = currentTracks.get(queueItem.trackId);
        const recommendation = candidate ? toPersonalizationTrack(candidate) : null;
        if (!recommendation) continue;
        void soqaroApi.recordPersonalizationEvent({
          id: `queue:${queueItem.id}:manual-selection`,
          track: recommendation,
          type: "manual-selection",
          surface: "radio",
          occurredAt: new Date().toISOString()
        }).catch(() => undefined);
      }

      for (const queueItem of previous.queue) {
        if (currentQueueIds.has(queueItem.id) || queueItem.source !== "autopilot") continue;
        if (queueItem.id === current.room.playback.currentQueueItemId) continue;
        const candidate = previousTracks.get(queueItem.trackId);
        const recommendation = candidate ? toPersonalizationTrack(candidate) : null;
        if (!recommendation) continue;
        void soqaroApi.recordPersonalizationEvent({
          id: `queue:${queueItem.id}:dismissed`,
          track: recommendation,
          type: "dismissed",
          surface: "radio",
          occurredAt: new Date().toISOString()
        }).catch(() => undefined);
      }
    }

    previousQueueRef.current = {
      queue: current.queue,
      tracks: current.tracks
    };
  }, [contextKey, input.activeUserId, input.roomSnapshot, isRadioHost]);

  useEffect(() => {
    const playback = input.roomSnapshot?.room.playback;
    const queueItemId = playback?.currentQueueItemId ?? null;
    const track = playback?.currentTrackId
      ? input.roomSnapshot?.tracks.find((item) => item.id === playback.currentTrackId) ?? null
      : null;
    const candidate = track ? toPersonalizationTrack(track) : null;

    if (!isRadioHost || !input.activeUserId || !contextKey || !queueItemId || !candidate || !track || !playback) {
      playbackRef.current = null;
      return;
    }

    const existing = playbackRef.current;
    if (!existing || existing.queueItemId !== queueItemId) {
      if (existing) {
        settlePlaybackSession(existing, input.activeUserId, contextKey);
      }
      playbackRef.current = {
        queueItemId,
        mediaEpoch: playback.mediaEpoch,
        track,
        durationMs: Math.max(0, track?.durationMs ?? 0),
        maxProgressMs: Math.max(0, input.progressMs),
        wasPlaying: input.isPlaying,
        completed: false
      };
    } else if (existing.mediaEpoch !== playback.mediaEpoch) {
      existing.mediaEpoch = playback.mediaEpoch;
      existing.maxProgressMs = Math.max(0, input.progressMs);
      existing.wasPlaying = input.isPlaying;
      existing.completed = false;
      existing.track = track;
      existing.durationMs = Math.max(0, track?.durationMs ?? 0);
    } else {
      existing.maxProgressMs = Math.max(existing.maxProgressMs, input.progressMs);
      existing.wasPlaying ||= input.isPlaying;
    }

    const session = playbackRef.current;
    if (!session || session.completed || !session.wasPlaying || session.durationMs <= 0) return;
    if (session.maxProgressMs / session.durationMs < 0.7) return;
    session.completed = true;
    void soqaroApi.recordPersonalizationEvent({
      id: `playback:${session.queueItemId}:${session.mediaEpoch}:completion`,
      track: toPersonalizationTrack(session.track)!,
      type: "completion",
      surface: "radio",
      occurredAt: new Date().toISOString()
    }).catch(() => undefined);
  }, [contextKey, input.activeUserId, input.isPlaying, input.progressMs, input.roomSnapshot, isRadioHost]);

  useEffect(() => {
    if (!isRadioHost || !input.activeUserId || !contextKey) return;
    const handleFavoriteChange = (event: Event) => {
      const detail = (event as CustomEvent<FavoriteTracksChangedDetail>).detail;
      if (!detail?.isFavorite || detail.userId !== input.activeUserId) return;
      void recordPersonalizationFavoriteCandidate(detail.track, true).catch(() => undefined);
    };
    window.addEventListener("soqaro-favorite-tracks-changed", handleFavoriteChange);
    return () => window.removeEventListener("soqaro-favorite-tracks-changed", handleFavoriteChange);
  }, [contextKey, input.activeUserId, isRadioHost]);
}

export function recordRadioRecommendationUnavailable(input: {
  userId: string;
  roomId: string;
  candidate: ProviderTrackCandidate;
}) {
  return soqaroApi.recordPersonalizationEvent({
    id: `radio:${input.roomId}:unavailable:${input.candidate.provider}:${input.candidate.providerTrackId}:${Date.now()}`,
    track: {
      provider: input.candidate.provider,
      providerTrackId: input.candidate.providerTrackId,
      access: input.candidate.access,
      quality: input.candidate.quality,
      title: input.candidate.title,
      artist: input.candidate.artist,
      album: input.candidate.album,
      providerAlbumId: input.candidate.providerAlbumId ?? null,
      durationMs: input.candidate.durationMs,
      artworkUrl: input.candidate.artworkUrl
    },
    type: "unavailable",
    surface: "radio",
    occurredAt: new Date().toISOString()
  });
}

function settlePlaybackSession(session: PlaybackSession, _userId: string, _contextKey: string) {
  if (session.completed || !session.wasPlaying || session.maxProgressMs >= 30_000) return;
  void soqaroApi.recordPersonalizationEvent({
    id: `playback:${session.queueItemId}:${session.mediaEpoch}:quick-skip`,
    track: toPersonalizationTrack(session.track)!,
    type: "quick-skip",
    surface: "radio",
    occurredAt: new Date().toISOString()
  }).catch(() => undefined);
}
