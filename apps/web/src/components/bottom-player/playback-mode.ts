export {
  shuffleTrackIds,
  synchronizeShuffleBagTrackIds,
  takeNextShuffleTrack
} from "@soqaro/shared";

export type PlaybackMode = "sequence" | "shuffle" | "single";

const playbackModes: PlaybackMode[] = ["sequence", "shuffle", "single"];

export function getNextPlaybackMode(mode: PlaybackMode): PlaybackMode {
  const currentIndex = playbackModes.indexOf(mode);
  return playbackModes[(currentIndex + 1) % playbackModes.length] ?? "sequence";
}
