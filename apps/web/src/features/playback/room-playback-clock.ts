type RoomPlaybackClockCalibrationInput = {
  serverNow: string | null | undefined;
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
};

type RoomPlaybackClockState = {
  offsetMs: number;
  bestRoundTripMs: number | null;
  calibratedAtMs: number | null;
};

export type RoomPlaybackBarrierClock = {
  blocked: boolean;
  holdPositionMs: number | null;
  resumeAtMs: number | null;
};

type RoomPlaybackClockPlayback = {
  status: "playing" | "paused" | "buffering";
  positionMs: number;
  startedAt?: string | null;
  startAt?: string | null;
};

const roomPlaybackClockState: RoomPlaybackClockState = {
  offsetMs: 0,
  bestRoundTripMs: null,
  calibratedAtMs: null
};

const calibrationRefreshMs = 60_000;

export function calibrateRoomPlaybackClock(input: RoomPlaybackClockCalibrationInput) {
  const serverNowMs = input.serverNow ? new Date(input.serverNow).getTime() : Number.NaN;
  const roundTripMs = input.responseReceivedAtMs - input.requestStartedAtMs;
  if (
    !Number.isFinite(serverNowMs) ||
    !Number.isFinite(roundTripMs) ||
    roundTripMs < 0
  ) {
    return false;
  }

  const shouldAcceptSample =
    roomPlaybackClockState.bestRoundTripMs === null ||
    roundTripMs <= roomPlaybackClockState.bestRoundTripMs ||
    roomPlaybackClockState.calibratedAtMs === null ||
    input.responseReceivedAtMs - roomPlaybackClockState.calibratedAtMs >= calibrationRefreshMs;
  if (!shouldAcceptSample) {
    return false;
  }

  const clientMidpointMs = input.requestStartedAtMs + roundTripMs / 2;
  roomPlaybackClockState.offsetMs = serverNowMs - clientMidpointMs;
  roomPlaybackClockState.bestRoundTripMs = roundTripMs;
  roomPlaybackClockState.calibratedAtMs = input.responseReceivedAtMs;
  return true;
}

export function getRoomPlaybackClockNowMs(clientNowMs = Date.now()) {
  return clientNowMs + roomPlaybackClockState.offsetMs;
}

export function resolveRoomPlaybackPositionMs(
  playback: RoomPlaybackClockPlayback,
  durationMs: number,
  nowMs = getRoomPlaybackClockNowMs(),
  barrier?: Pick<RoomPlaybackBarrierClock, "holdPositionMs" | "resumeAtMs"> | null
) {
  const clamp = (value: number) => durationMs > 0
    ? Math.min(Math.max(0, value), durationMs)
    : Math.max(0, value);
  if (playback.status !== "playing") {
    return clamp(playback.positionMs);
  }

  const holdPositionMs = barrier?.holdPositionMs;
  if (typeof holdPositionMs === "number" && Number.isFinite(holdPositionMs)) {
    const resumeAtMs = barrier?.resumeAtMs;
    const elapsedAfterResume = typeof resumeAtMs === "number" &&
      Number.isFinite(resumeAtMs)
      ? Math.max(0, nowMs - resumeAtMs)
      : 0;
    return clamp(holdPositionMs + elapsedAfterResume);
  }

  const anchorAt = playback.startedAt ?? playback.startAt ?? null;
  const anchorMs = anchorAt ? Date.parse(anchorAt) : Number.NaN;
  if (!Number.isFinite(anchorMs)) {
    return clamp(playback.positionMs);
  }
  return clamp(playback.positionMs + Math.max(0, nowMs - anchorMs));
}

export function getRoomPlaybackClockSnapshot() {
  return { ...roomPlaybackClockState };
}

export function resetRoomPlaybackClockForTests() {
  roomPlaybackClockState.offsetMs = 0;
  roomPlaybackClockState.bestRoundTripMs = null;
  roomPlaybackClockState.calibratedAtMs = null;
}
