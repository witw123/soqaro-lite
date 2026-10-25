/**
 * Receiver audio health for the room's segmented playback broadcast.
 *
 * These helpers track a listener's media clock against the broadcast and decide
 * when a live-but-silent receiver should be recovered by restarting the media
 * peer, without treating an autoplay-paused element as a media failure.
 */

export const receiverBufferingGraceMs = 2_000;
export const receiverStartupGraceMs = 1_500;
export const receiverProgressRecoveryMs = 2_500;
export const receiverRecoveryRetryMs = 5_000;

export type ReceiverAudioHealth = {
  lastProgressAtMs: number;
  lastCurrentTime: number | null;
  hasStarted: boolean;
  waitingSinceMs: number | null;
  lastRecoveryAtMs?: number;
  recoveryCount?: number;
};

export function recordReceiverAudioProgress(input: {
  health: ReceiverAudioHealth;
  event: "playing" | "progress";
  currentTime: number | null;
  nowMs: number;
}) {
  const currentTime = input.currentTime !== null && Number.isFinite(input.currentTime)
    ? input.currentTime
    : null;
  const previousTime = input.health.lastCurrentTime;
  const advanced = currentTime !== null && (
    previousTime !== null
      ? currentTime > previousTime + 0.01
      : currentTime > 0.01
  );

  if (input.event === "playing") {
    input.health.hasStarted = true;
  }
  if (advanced) {
    input.health.lastProgressAtMs = input.nowMs;
    input.health.hasStarted = true;
    input.health.waitingSinceMs = null;
  }
  input.health.lastCurrentTime = currentTime;
  return advanced;
}

export function shouldRecoverStalledReceiverAudio(input: {
  boundAtMs: number;
  hasStarted: boolean;
  lastProgressAtMs: number;
  nowMs: number;
  receiverRtpActive?: boolean;
  audioPaused?: boolean;
  startupGraceMs?: number;
  recoveryAfterMs?: number;
}) {
  if (!input.hasStarted || input.audioPaused === true) {
    return false;
  }
  // `HTMLMediaElement.currentTime` is not a dependable health clock for a
  // live MediaStream in every browser. When RTP is still arriving, restarting
  // the peer only replays its jitter buffer and creates an audible loop.
  if (input.receiverRtpActive === true) {
    return false;
  }
  const startupStalled = input.receiverRtpActive === false &&
    input.nowMs - input.boundAtMs >= (input.startupGraceMs ?? receiverStartupGraceMs);
  const progressStalled = input.nowMs - input.boundAtMs >=
    (input.startupGraceMs ?? receiverStartupGraceMs) &&
    input.nowMs - input.lastProgressAtMs >= (input.recoveryAfterMs ?? receiverProgressRecoveryMs);
  return startupStalled || progressStalled;
}

export function resolveReceiverPlaybackState(input: {
  receiverRtpActive?: boolean;
  hasStarted: boolean;
  lastProgressAtMs?: number;
  missingMediaSinceMs: number | null;
  nowMs: number;
  graceMs?: number;
}): "buffering" | "live" {
  const hasRecentProgress = typeof input.lastProgressAtMs === "number" &&
    input.nowMs - input.lastProgressAtMs < 1_500;
  if (!input.hasStarted) {
    return "buffering";
  }
  if (input.receiverRtpActive === true) {
    return "live";
  }
  // When progress telemetry is available, a live RTP track without a moving
  // media clock is not audible. Keep a short grace window for jitter, then
  // expose buffering so the UI does not claim that the member is speaking.
  if (typeof input.lastProgressAtMs === "number" && !hasRecentProgress) {
    const staleSince = input.missingMediaSinceMs ?? input.lastProgressAtMs;
    if (input.nowMs - staleSince >= (input.graceMs ?? receiverBufferingGraceMs)) {
      return "buffering";
    }
    return "live";
  }
  if (input.missingMediaSinceMs === null) {
    return "live";
  }
  return input.nowMs - input.missingMediaSinceMs >=
    (input.graceMs ?? receiverBufferingGraceMs)
    ? "buffering"
    : "live";
}
