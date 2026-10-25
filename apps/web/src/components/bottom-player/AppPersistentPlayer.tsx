"use client";

import { BottomPlayer } from "./BottomPlayer";
import { useLocalPlayer, usePlayerProgressMs } from "@/features/playback/local-player-context";

export function AppPersistentPlayer() {
  const player = useLocalPlayer();
  const progressMs = usePlayerProgressMs();

  return (
    <BottomPlayer
      desktopLyricsSource="local"
      mobileVariant="compact"
      audioRef={player.audioRef}
      playback={player.playback}
      canControlPlayback={player.canControlPlayback}
      canSeekPlayback={player.canSeekPlayback}
      progressMs={progressMs}
      seekDraft={player.seekDraft}
      setSeekDraft={player.setSeekDraft}
      audioDurationMs={player.audioDurationMs}
      volume={player.volume}
      setVolume={player.setVolume}
      syncProgressFromAudio={player.syncProgressFromAudio}
      syncDurationFromAudio={player.syncDurationFromAudio}
      currentTrack={player.currentTrack}
      onPlay={player.onPlay}
      onPause={player.onPause}
      onSeek={player.onSeek}
      onPrev={player.onPrev}
      onNext={player.onNext}
      onCyclePlaybackMode={player.onCyclePlaybackMode}
      queue={player.queue}
      tracks={player.tracks}
      currentQueueItemId={player.currentQueueItemId}
      nextQueueItemId={player.playback?.nextQueueItemId ?? null}
      canReorderQueue={true}
      canRemoveQueue={true}
      onPlayQueueItem={player.onPlayQueueItem}
      onPlayNextQueueItem={player.onPlayNextQueueItem}
      onRemoveQueueItem={player.onRemoveQueueItem}
      onReorderQueue={player.onReorderQueue}
    />
  );
}
