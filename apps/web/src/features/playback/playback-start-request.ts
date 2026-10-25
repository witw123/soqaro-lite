import type { PlaybackSnapshot } from "@soqaro/shared";

function hasActivePlayback(playback: PlaybackSnapshot | null | undefined) {
  return playback?.status === "playing" || playback?.status === "buffering";
}

export type PlaybackStartRequestReason =
  | "user-play"
  | "queue-advance"
  | "track-change"
  | "room-resync";

export type PlaybackStartRequest = {
  id: string;
  reason: PlaybackStartRequestReason;
  trackId: string | null;
  queueItemId: string | null;
  targetPlaybackRevision: number;
  previousQueueVersion: number | null;
  previousMediaEpoch: number | null;
  createdAt: number;
  expiresAt: number;
  state: "pending" | "satisfied" | "failed";
  failureReason: string | null;
};

const defaultTtlMs = 7_000;

function createRequestId(now: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `playback_request_${now}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createPlaybackStartRequest(input: {
  reason: PlaybackStartRequestReason;
  trackId?: string | null;
  queueItemId?: string | null;
  targetPlaybackRevision: number;
  previousQueueVersion?: number | null;
  previousMediaEpoch?: number | null;
  now?: number;
  ttlMs?: number;
}): PlaybackStartRequest {
  const createdAt = input.now ?? Date.now();
  return {
    id: createRequestId(createdAt),
    reason: input.reason,
    trackId: input.trackId ?? null,
    queueItemId: input.queueItemId ?? null,
    targetPlaybackRevision: input.targetPlaybackRevision,
    previousQueueVersion: input.previousQueueVersion ?? null,
    previousMediaEpoch: input.previousMediaEpoch ?? null,
    createdAt,
    expiresAt: createdAt + (input.ttlMs ?? defaultTtlMs),
    state: "pending",
    failureReason: null
  };
}

export function isPlaybackStartRequestPending(
  request: PlaybackStartRequest | null | undefined,
  now = Date.now()
) {
  return !!request && request.state === "pending" && request.expiresAt > now;
}

export function doesPlaybackMatchStartRequest(
  request: PlaybackStartRequest | null | undefined,
  playback: PlaybackSnapshot | null | undefined,
  now = Date.now()
) {
  if (!request || !isPlaybackStartRequestPending(request, now) || !playback?.currentTrackId || !hasActivePlayback(playback)) {
    return false;
  }
  if ((playback.playbackRevision ?? playback.queueVersion) < request.targetPlaybackRevision) return false;
  if (request.previousQueueVersion !== null && playback.queueVersion <= request.previousQueueVersion) return false;
  if (
    request.previousMediaEpoch !== null &&
    request.trackId !== null &&
    playback.currentTrackId === request.trackId &&
    playback.mediaEpoch < request.previousMediaEpoch
  ) return false;
  if (request.queueItemId) return playback.currentQueueItemId === request.queueItemId;
  if (request.trackId) return playback.currentTrackId === request.trackId;
  return true;
}

export function doesAudiblePlaybackSatisfyStartRequest(
  request: PlaybackStartRequest | null | undefined,
  playback: PlaybackSnapshot | null | undefined,
  now = Date.now()
) {
  if (!request || !isPlaybackStartRequestPending(request, now) || !playback?.currentTrackId || !hasActivePlayback(playback)) {
    return false;
  }
  if (request.queueItemId) return playback.currentQueueItemId === request.queueItemId;
  if (request.trackId) return playback.currentTrackId === request.trackId;
  return true;
}

export function satisfyPlaybackStartRequest(
  request: PlaybackStartRequest,
  now = Date.now()
): PlaybackStartRequest {
  return { ...request, state: "satisfied", failureReason: null, createdAt: request.createdAt, expiresAt: now };
}

export function failPlaybackStartRequest(
  request: PlaybackStartRequest,
  failureReason: string
): PlaybackStartRequest {
  return { ...request, state: "failed", failureReason };
}

export function getPlaybackStartRequestLabel(request: PlaybackStartRequest | null | undefined) {
  if (!request) return null;
  if (request.queueItemId) return `队列点播 ${request.queueItemId}`;
  if (request.trackId) return `曲库点播 ${request.trackId}`;
  if (request.reason === "queue-advance") return "队列切歌";
  if (request.reason === "track-change") return "切换曲目";
  if (request.reason === "room-resync") return "房间恢复";
  return "恢复播放";
}
