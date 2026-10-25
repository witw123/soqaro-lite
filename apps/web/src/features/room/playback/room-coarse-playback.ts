import type {
  PlaybackAudioPath,
  SegmentedPlaybackSnapshot
} from "@/features/playback/use-segmented-opus-playback";

export type RoomCoarsePlaybackState = {
  state: SegmentedPlaybackSnapshot["state"];
  audioPath?: PlaybackAudioPath;
  sourceHealth?: SegmentedPlaybackSnapshot["sourceHealth"];
  lastError: string | null;
};

export const initialCoarsePlaybackState: RoomCoarsePlaybackState = {
  state: "idle",
  audioPath: undefined,
  sourceHealth: undefined,
  lastError: null
};

export function isCoarsePlaybackEqual(
  a: RoomCoarsePlaybackState,
  b: RoomCoarsePlaybackState
): boolean {
  return (
    a.state === b.state &&
    a.audioPath === b.audioPath &&
    a.sourceHealth === b.sourceHealth &&
    a.lastError === b.lastError
  );
}
