import type { PlaybackSnapshot } from "@soqaro/shared";

export type PendingSeek = {
  requestId: number;
  trackId: string | null;
  targetPositionMs: number;
  expectedPlaybackRevision: number | null;
};

const seekConfirmationToleranceMs = 500;

export function isPendingSeekTargetReached(input: {
  pendingSeek: PendingSeek;
  playback: Pick<PlaybackSnapshot, "currentTrackId" | "positionMs">;
}) {
  return (
    input.playback.currentTrackId === input.pendingSeek.trackId &&
    Math.abs(input.playback.positionMs - input.pendingSeek.targetPositionMs) <=
      seekConfirmationToleranceMs
  );
}

export function shouldResolvePendingSeek(input: {
  pendingSeek: PendingSeek;
  playback: Pick<PlaybackSnapshot, "currentTrackId" | "positionMs" | "playbackRevision">;
}) {
  const { pendingSeek, playback } = input;
  const expectedRevision = pendingSeek.expectedPlaybackRevision;

  if (expectedRevision === null || playback.playbackRevision < expectedRevision) {
    return false;
  }

  return (
    isPendingSeekTargetReached({ pendingSeek, playback }) ||
    playback.playbackRevision > expectedRevision
  );
}
