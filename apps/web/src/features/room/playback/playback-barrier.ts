/**
 * Playback diagnostics and cache-independent room clock policy.
 */

import type { RoomPlaybackBarrierClock } from "@/features/playback/room-playback-clock";
import type { SegmentedPlaybackSnapshot } from "@/features/playback/use-segmented-opus-playback";
import { roomAudioOutput } from "@/features/playback/room-audio-output";


export function idlePlaybackSnapshot(): SegmentedPlaybackSnapshot {
  return {
    state: "idle",
    bufferedMs: 0,
    ownedUnitCount: 0,
    totalUnitCount: 0,
    audioContextState: roomAudioOutput.getSharedAudioContext()?.state ?? null,
    lastError: null
  };
}

export function isSegmentedPlaybackAudible(input: {
  state: SegmentedPlaybackSnapshot["state"];
  isCurrentSource: boolean;
  sourceHealth?: SegmentedPlaybackSnapshot["sourceHealth"];
  nativeLocalAudio?: boolean;
}) {
  return input.state === "live" && (
    input.nativeLocalAudio === true ||
    !input.isCurrentSource ||
    input.sourceHealth === "source-ready"
  );
}

// Cache readiness cannot override the authoritative room clock.
export const uninterruptedRoomClock: RoomPlaybackBarrierClock = {
  blocked: false,
  resumeAtMs: null,
  holdPositionMs: null
};

export function toDiagnosticPlaybackState(state: SegmentedPlaybackSnapshot["state"]) {
  if (state === "unavailable") {
    return "failed" as const;
  }
  if (state === "ended") {
    return "paused" as const;
  }
  return state;
}

export function toDiagnosticSourceStartState(state: SegmentedPlaybackSnapshot["state"]) {
  if (state === "awaiting-unlock") {
    return "awaiting-unlock" as const;
  }
  if (state === "buffering") {
    return "starting" as const;
  }
  if (state === "unavailable") {
    return "failed" as const;
  }
  if (state === "live" || state === "ended") {
    return "live" as const;
  }
  return "idle" as const;
}
