"use client";

import { memo } from "react";
import type { TrackMeta } from "@soqaro/shared";
import { AudioUnlockOverlay, MobileAppNavigation } from "@/components/shell";
import { CachePlaybackPromptModal } from "@/components/room/CachePlaybackPromptModal";

export type RoomOverlaySectionProps = {
  audioBlockedOverlay: boolean;
  onUnlockAudio: () => void;
  isMissingOpsAsset: boolean;
  currentTrack: TrackMeta | null;
  isSourceOwner: boolean;
  onCloseCachePrompt: () => void;
  onEnableCache: () => void;
  isRoomAway: boolean;
  onAwayRoom: () => void;
  backgroundOnly?: boolean;
};

function RoomOverlaySectionComponent({
  audioBlockedOverlay,
  onUnlockAudio,
  isMissingOpsAsset,
  currentTrack,
  isSourceOwner,
  onCloseCachePrompt,
  onEnableCache,
  isRoomAway,
  onAwayRoom,
  backgroundOnly = false
}: RoomOverlaySectionProps) {
  return (
    <>
      {!backgroundOnly ? (
        <>
          <AudioUnlockOverlay
            visible={audioBlockedOverlay}
            onUnlock={onUnlockAudio}
          />
          <MobileAppNavigation onNavigateAway={isRoomAway ? undefined : onAwayRoom} />
        </>
      ) : null}
      <CachePlaybackPromptModal
        isOpen={isMissingOpsAsset}
        track={currentTrack}
        isSourceOwner={isSourceOwner}
        onClose={onCloseCachePrompt}
        onEnabled={onEnableCache}
      />
    </>
  );
}

export const RoomOverlaySection = memo(RoomOverlaySectionComponent);
