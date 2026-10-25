"use client";

import { memo } from "react";
import type {
  BilibiliTrackCandidate,
  NeteaseTrackCandidate,
  QqMusicTrackCandidate,
  TrackMeta
} from "@soqaro/shared";
import { RoomProviderTrackSearch } from "./RoomProviderTrackSearch";

export type SearchTabPanelProps = {
  canManageLibrary: boolean;
  onImportNeteaseTrack?: (track: NeteaseTrackCandidate) => Promise<void>;
  onImportQqMusicTrack?: (track: QqMusicTrackCandidate) => Promise<void>;
  onImportBilibiliTrack?: (track: BilibiliTrackCandidate) => Promise<void>;
  onImportBilibiliTracks?: (tracks: BilibiliTrackCandidate[]) => Promise<void>;
  roomTracks: TrackMeta[];
};

function SearchTabPanelBase({
  canManageLibrary,
  onImportNeteaseTrack,
  onImportQqMusicTrack,
  onImportBilibiliTrack,
  onImportBilibiliTracks,
  roomTracks
}: SearchTabPanelProps) {
  return (
    <div className="animate-fade-in flex w-full flex-col gap-3" data-testid="room-search-tab-panel">
      <RoomProviderTrackSearch
        canManageLibrary={canManageLibrary}
        hideUnavailableProvidersNotice
        mode="import"
        onImportNeteaseTrack={onImportNeteaseTrack}
        onImportQqMusicTrack={onImportQqMusicTrack}
        onImportBilibiliTrack={onImportBilibiliTrack}
        onImportBilibiliTracks={onImportBilibiliTracks}
        roomTracks={roomTracks}
        surface="plain"
        testId="room-search-provider-search"
      />
    </div>
  );
}

export const SearchTabPanel = memo(SearchTabPanelBase);
