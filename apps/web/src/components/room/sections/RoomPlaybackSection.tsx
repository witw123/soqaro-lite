"use client";

import { memo, type RefObject } from "react";
import type {
  AuthSession,
  PlaybackMode,
  PlaybackSnapshot,
  RoomSnapshot,
  TrackMeta
} from "@soqaro/shared";
import type { RoomPlaybackBarrierClock } from "@/features/playback/room-playback-clock";
import { BottomPlayerController } from "@/components/bottom-player/BottomPlayerController";
import { getNextPlaybackMode } from "@/components/bottom-player/playback-mode";

export type RoomPlaybackSectionProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  isSourceOwner: boolean;
  roomSnapshot: RoomSnapshot | null;
  playbackBarrier?: RoomPlaybackBarrierClock | null;
  activeSession: AuthSession | null;
  currentTrack: TrackMeta | null;
  canReorderQueue: boolean;
  playerResetEpoch: number;
  onPlaybackPositionChange: (pos: number) => void;
  onVolumeChange: (vol: number) => void;
  onPlay: (trackId?: string) => void | Promise<void>;
  onPause: (positionMs?: number) => void | Promise<void>;
  onSeek: (positionMs: number) => Promise<PlaybackSnapshot | null>;
  onSeekRequestReady: (requestSeek: ((positionMs: number) => void) | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onCyclePlaybackMode?: () => void | Promise<void>;
  onPlayQueueItem: (queueItemId: string) => Promise<void>;
  onPlayNextQueueItem: (queueItemId: string) => Promise<void>;
  onRemoveQueueItem: (queueItemId: string) => Promise<void>;
  onRemoveQueueItems?: (queueItemIds: string[]) => Promise<void>;
  onReorderQueue: (queueItemIds: string[]) => Promise<void>;
  onSetPlaybackMode?: (mode: PlaybackMode) => void | Promise<void>;
};

function RoomPlaybackSectionComponent({
  audioRef,
  isSourceOwner,
  roomSnapshot,
  playbackBarrier,
  activeSession,
  currentTrack,
  canReorderQueue,
  playerResetEpoch,
  onPlaybackPositionChange,
  onVolumeChange,
  onPlay,
  onPause,
  onSeek,
  onSeekRequestReady,
  onPrev,
  onNext,
  onCyclePlaybackMode,
  onPlayQueueItem,
  onPlayNextQueueItem,
  onRemoveQueueItem,
  onRemoveQueueItems,
  onReorderQueue,
  onSetPlaybackMode
}: RoomPlaybackSectionProps) {
  const roomType = roomSnapshot?.room.roomType;
  const isHostControlledRoom = roomType === "request" || roomType === "radio";
  const isRoomHost = !!activeSession && roomSnapshot?.room.hostId === activeSession.userId;

  const handleCyclePlaybackMode =
    onCyclePlaybackMode ??
    (() => {
      if (!onSetPlaybackMode) return;
      const currentMode = roomSnapshot?.room.playback.playbackMode ?? "sequence";
      return onSetPlaybackMode(getNextPlaybackMode(currentMode));
    });

  return (
    <BottomPlayerController
      mobileVariant="compact"
      audioRef={audioRef}
      isSourceOwner={isSourceOwner}
      roomSnapshot={roomSnapshot}
      playbackBarrier={playbackBarrier}
      activeSession={activeSession}
      currentTrack={currentTrack}
      canSeekPlayback={!isHostControlledRoom || isRoomHost}
      canControlPlaybackOverride={isHostControlledRoom ? isRoomHost : undefined}
      resetEpoch={playerResetEpoch}
      onPlaybackPositionChange={onPlaybackPositionChange}
      onVolumeChange={onVolumeChange}
      onPlay={onPlay as () => void}
      onPause={onPause}
      onSeek={onSeek}
      onSeekRequestReady={onSeekRequestReady}
      onPrev={onPrev}
      onNext={onNext}
      onCyclePlaybackMode={handleCyclePlaybackMode}
      canReorderQueue={isHostControlledRoom ? isRoomHost : canReorderQueue}
      canRemoveQueue={isHostControlledRoom ? isRoomHost : !!activeSession && canReorderQueue}
      onPlayQueueItem={onPlayQueueItem}
      onPlayNextQueueItem={onPlayNextQueueItem}
      onRemoveQueueItem={onRemoveQueueItem}
      onRemoveQueueItems={onRemoveQueueItems}
      onReorderQueue={onReorderQueue}
    />
  );
}

export const RoomPlaybackSection = memo(RoomPlaybackSectionComponent);
