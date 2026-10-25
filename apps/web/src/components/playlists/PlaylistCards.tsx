import React from "react";
import type { Playlist } from "@soqaro/shared";
import type { LocalPlaylistRecord, LocalPlaylistTrackRecord } from "@/features/playlist/local-playlist";
import { Button } from "@/components/ui/button";
import {
  Artwork,
  getNetworkPlaylistSource,
  getTrackArtworkUrls
} from "./playlist-artwork";

export function LocalPlaylistCard({
  onOpen,
  onDelete,
  playlist,
  tracks
}: {
  onOpen: () => void;
  onDelete?: () => void;
  playlist: LocalPlaylistRecord;
  tracks: LocalPlaylistTrackRecord[];
}) {
  const artworkUrls = getTrackArtworkUrls(tracks);
  const downloadedCount = tracks.filter((track) => track.availableOffline).length;

  return (
    <article className="group relative min-w-0">
      <button
        aria-label={`打开本地歌单 ${playlist.title}`}
        className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        onClick={onOpen}
        type="button"
      >
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface border border-surface-border shadow-xs transition-transform duration-200 group-hover:-translate-y-0.5">
          <Artwork artworkUrls={artworkUrls} size="cover" title={playlist.title} />
          <span className="absolute bottom-2 left-2 rounded-md bg-background/80 border border-surface-border/60 px-1.5 py-0.5 text-xs font-medium text-foreground-muted backdrop-blur-md">
            本地
          </span>
        </div>
        <div className="min-w-0 px-0.5 pt-2">
          <strong className="block truncate text-xs sm:text-sm font-medium text-foreground">
            {playlist.title}
          </strong>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {tracks.length} 首歌曲，已下载 {downloadedCount} 首
          </p>
        </div>
      </button>
      {onDelete ? (
        <Button
          aria-label={`删除本地歌单 ${playlist.title}`}
          className="absolute right-1.5 top-1.5 h-7 w-7 rounded-md bg-background/80 border border-surface-border/60 text-foreground-muted opacity-100 backdrop-blur-md transition-all hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onDelete}
          size="icon"
          title="删除歌单"
          type="button"
          variant="ghost"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 10v7m4-7v7" />
          </svg>
        </Button>
      ) : null}
    </article>
  );
}

export function NetworkPlaylistCard({
  playlist,
  artworkUrls,
  onOpen,
  onDelete
}: {
  playlist: Playlist;
  artworkUrls: readonly string[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const source = getNetworkPlaylistSource(playlist);
  const providerName =
    source?.provider === "qqmusic"
      ? "QQ 音乐"
      : source?.provider === "netease"
        ? "网易云音乐"
        : "网络歌单";

  return (
    <article className="group relative min-w-0">
      <button
        aria-label={`打开歌单 ${playlist.title}`}
        className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        onClick={onOpen}
        type="button"
      >
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface border border-surface-border shadow-xs transition-transform duration-200 group-hover:-translate-y-0.5">
          <Artwork artworkUrls={artworkUrls} size="cover" title={playlist.title} />
        </div>
        <div className="min-w-0 px-0.5 pt-2">
          <strong className="block truncate text-xs sm:text-sm font-medium text-foreground">
            {playlist.title}
          </strong>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {providerName} / {playlist.trackIds.length} 首歌曲
          </p>
        </div>
      </button>
      <Button
        aria-label={`删除歌单 ${playlist.title}`}
        className="absolute right-1.5 top-1.5 h-7 w-7 rounded-md bg-background/80 border border-surface-border/60 text-foreground-muted opacity-100 backdrop-blur-md transition-all hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
        size="icon"
        title="删除歌单"
        type="button"
        variant="ghost"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="14"
        >
          <path d="M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 10v7m4-7v7" />
        </svg>
      </Button>
    </article>
  );
}
