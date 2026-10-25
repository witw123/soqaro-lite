"use client";

import { memo, useState } from "react";
import type {
  AuthSession,
  BilibiliTrackCandidate,
  NeteaseTrackCandidate,
  Playlist,
  QqMusicTrackCandidate,
  RoomMember,
  TrackMeta
} from "@soqaro/shared";
import type { CachedLibraryTrack, UploadedTrack } from "@/features/library/audio-utils";
import { TrackListSection } from "./TrackListSection";
import { RoomLibraryPlaylistsSection } from "./RoomLibraryPlaylistsSection";
import { FolderIcon, MusicIcon } from "@/components/icons/DiscoverIcons";

export type LibraryTabPanelProps = {
  roomId?: string | null;
  tracks: TrackMeta[];
  members?: Array<Pick<RoomMember, "id" | "presenceState">> | null;
  uploadedTracks: Record<string, UploadedTrack>;
  localFolderName: string | null;
  localSavedFileHashes: string[];
  canControlPlayback: boolean;
  canManageLibrary: boolean;
  canManageAllTracks?: boolean;
  canAddToQueue: boolean;
  activeSession: AuthSession | null;
  onFilesSelected: (files: FileList | File[] | null) => Promise<void>;
  onAddToQueue: (trackId: string) => Promise<unknown>;
  onSaveTrackToLocal: (track: TrackMeta) => Promise<void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onDeleteTracks?: (trackIds: string[]) => Promise<unknown>;
  onPlayTrack: (trackId: string) => Promise<void>;
  onReorderTracks?: (trackIds: string[]) => Promise<void>;
  onBatchAddToQueue?: (trackIds: string[]) => Promise<unknown>;
  // Room Library Playlists
  roomPlaylists?: Playlist[];
  onDeletePlaylist?: (playlistId: string) => Promise<void>;
  onLoadPlaylistIntoRoom?: (playlistId: string) => Promise<void>;
  onImportNeteaseTrack?: (track: NeteaseTrackCandidate) => Promise<void>;
  onImportQqMusicTrack?: (track: QqMusicTrackCandidate) => Promise<void>;
  onImportBilibiliTrack?: (track: BilibiliTrackCandidate) => Promise<void>;
  onImportNeteaseTracks?: (tracks: NeteaseTrackCandidate[]) => Promise<void>;
  onImportQqMusicTracks?: (tracks: QqMusicTrackCandidate[]) => Promise<void>;
  onImportBilibiliTracks?: (tracks: BilibiliTrackCandidate[]) => Promise<void>;
  onImportCachedTrack?: (track: CachedLibraryTrack) => Promise<void>;
  onRefreshRoom?: () => Promise<unknown>;
  onSwitchToDesk?: () => void;
  hideLocalAudioImport?: boolean;
};

function LibraryTabPanelBase({
  roomId,
  tracks,
  members,
  uploadedTracks,
  localFolderName,
  localSavedFileHashes,
  canControlPlayback,
  canManageLibrary,
  canManageAllTracks,
  canAddToQueue,
  activeSession,
  onFilesSelected,
  onAddToQueue,
  onSaveTrackToLocal,
  onDeleteTrack,
  onDeleteTracks,
  onPlayTrack,
  onReorderTracks,
  onBatchAddToQueue,
  roomPlaylists,
  onDeletePlaylist,
  onLoadPlaylistIntoRoom,
  onImportNeteaseTrack,
  onImportQqMusicTrack,
  onImportBilibiliTrack,
  onImportNeteaseTracks,
  onImportQqMusicTracks,
  onImportBilibiliTracks,
  onImportCachedTrack,
  onRefreshRoom,
  onSwitchToDesk,
  hideLocalAudioImport
}: LibraryTabPanelProps) {
  const [subTab, setSubTab] = useState<"tracks" | "playlists">("tracks");

  return (
    <div className="animate-fade-in flex w-full flex-col gap-3">
      {roomPlaylists !== undefined ? (
        <div
          aria-label="曲库视图切换"
          className="flex items-center gap-1 rounded-lg border border-surface-border/60 bg-surface/30 p-0.5"
          role="tablist"
        >
          <button
            aria-selected={subTab === "tracks"}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              subTab === "tracks"
                ? "bg-surface-elevated text-foreground font-semibold shadow-2xs"
                : "text-foreground-muted hover:text-foreground hover:bg-surface-hover/30"
            }`}
            onClick={() => setSubTab("tracks")}
            role="tab"
            type="button"
          >
            <MusicIcon className={`w-3.5 h-3.5 transition-colors ${subTab === "tracks" ? "text-accent" : "text-foreground-muted"}`} />
            <span>单曲 ({tracks.length})</span>
          </button>
          <button
            aria-selected={subTab === "playlists"}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              subTab === "playlists"
                ? "bg-surface-elevated text-foreground font-semibold shadow-2xs"
                : "text-foreground-muted hover:text-foreground hover:bg-surface-hover/30"
            }`}
            onClick={() => setSubTab("playlists")}
            role="tab"
            type="button"
          >
            <FolderIcon className={`w-3.5 h-3.5 transition-colors ${subTab === "playlists" ? "text-accent" : "text-foreground-muted"}`} />
            <span>歌单 ({roomPlaylists.length})</span>
          </button>
        </div>
      ) : null}

      {subTab === "tracks" || roomPlaylists === undefined ? (
        <>
          <TrackListSection
            activeSession={activeSession}
            canAddToQueue={canAddToQueue}
            canControlPlayback={canControlPlayback}
            canManageAllTracks={canManageAllTracks}
            canManageLibrary={canManageLibrary}
            hideLocalAudioImport={hideLocalAudioImport}
            localFolderName={localFolderName}
            localSavedFileHashes={localSavedFileHashes}
            members={members}
            onAddToQueue={onAddToQueue}
            onBatchAddToQueue={onBatchAddToQueue}
            onDeleteTrack={onDeleteTrack}
            onDeleteTracks={onDeleteTracks}
            onFilesSelected={onFilesSelected}
            onPlayTrack={onPlayTrack}
            onReorderTracks={onReorderTracks}
            onSaveTrackToLocal={onSaveTrackToLocal}
            onRefreshRoom={onRefreshRoom}
            roomId={roomId}
            tracks={tracks}
            uploadedTracks={uploadedTracks}
          />
        </>
      ) : (
        <RoomLibraryPlaylistsSection
          canAddToQueue={canAddToQueue}
          canManageLibrary={canManageLibrary}
          onDeletePlaylist={onDeletePlaylist ?? (() => Promise.resolve())}
          onImportBilibiliTrack={onImportBilibiliTrack}
          onImportBilibiliTracks={onImportBilibiliTracks}
          onImportCachedTrack={onImportCachedTrack}
          onImportNeteaseTrack={onImportNeteaseTrack}
          onImportNeteaseTracks={onImportNeteaseTracks}
          onImportQqMusicTrack={onImportQqMusicTrack}
          onImportQqMusicTracks={onImportQqMusicTracks}
          onLoadPlaylistIntoRoom={onLoadPlaylistIntoRoom ?? (() => Promise.resolve())}
          onSwitchToDesk={onSwitchToDesk}
          roomPlaylists={roomPlaylists}
          tracks={tracks}
        />
      )}
    </div>
  );
}

export const LibraryTabPanel = memo(LibraryTabPanelBase);
