"use client";

import { useState } from "react";
import type { ProviderPlaylistDetail } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import {
  ProviderAlbumTrackTable,
  type ProviderAlbumTrackActions
} from "./ProviderAlbumDetailView";
import { MediaArtwork } from "@/components/ui/media-artwork";
import {
  PlayIcon,
  HeartIcon,
  ChevronLeftIcon
} from "@/components/icons/DiscoverIcons";

type ProviderPlaylistDetailViewProps = {
  playlist: ProviderPlaylistDetail;
  isFavorite: boolean;
  pending: string | null;
  onBack: () => void;
  onToggleFavorite: () => Promise<void>;
  trackActions?: ProviderAlbumTrackActions;
  onPlayAll?: (tracks: ProviderPlaylistDetail["tracks"]) => void | Promise<void>;
};

export function ProviderPlaylistDetailView({
  playlist,
  isFavorite,
  pending,
  onBack,
  onToggleFavorite,
  trackActions,
  onPlayAll
}: ProviderPlaylistDetailViewProps) {
  return (
    <section className="mt-3 sm:mt-6 animate-in fade-in duration-300">
      {/* Sleek Vector Back Button */}
      <button
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground mb-4 border border-surface-border bg-surface/50"
        onClick={onBack}
        type="button"
      >
        <ChevronLeftIcon className="w-3.5 h-3.5" />
        <span>返回</span>
      </button>

      {/* Playlist Hero Stage */}
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface/40 p-4 sm:p-5 backdrop-blur-md grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-[144px_minmax(0,1fr)] md:grid-cols-[160px_minmax(0,1fr)] items-center sm:items-end">
        <div className="w-32 sm:w-36 md:w-40 max-w-[160px] mx-auto sm:mx-0 shrink-0">
          <PlaylistArtwork alt={playlist.title} src={playlist.artworkUrl} />
        </div>
        <div className="relative z-10 flex min-w-0 flex-col justify-end text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <span className="inline-flex items-center rounded-md bg-surface border border-surface-border px-2 py-0.5 text-xs font-medium text-foreground-muted">
              歌单
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{playlist.title}</h1>
          <p className="mt-1 text-xs text-foreground-muted font-medium">
            {playlist.creatorName || "网络歌单"} / {playlist.tracks.length} 首歌曲
          </p>
          <DescriptionDisclosure description={playlist.description} />
          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            {playlist.tracks.length > 0 && (onPlayAll || trackActions?.onPlay) ? (
              <button
                type="button"
                onClick={() => {
                  if (onPlayAll) {
                    void onPlayAll(playlist.tracks);
                  } else if (playlist.tracks[0]) {
                    trackActions?.onPlay?.(playlist.tracks[0]);
                  }
                }}
                className="inline-flex h-8 items-center gap-1.5 px-3.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-xs transition-colors active:scale-95"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                <span>播放全部</span>
              </button>
            ) : null}
            <Button
              aria-pressed={isFavorite}
              disabled={pending !== null}
              onClick={() => void onToggleFavorite()}
              size="sm"
              type="button"
              className={`h-8 rounded-lg text-xs font-medium border ${
                isFavorite
                  ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/30"
                  : "bg-surface hover:bg-surface-hover text-foreground border-surface-border"
              }`}
            >
              <HeartIcon className="w-3.5 h-3.5" />
              <span>{isFavorite ? "已收藏" : "收藏歌单"}</span>
            </Button>
            <span className="inline-flex h-8 items-center px-2.5 rounded-lg bg-surface border border-surface-border text-xs font-mono text-foreground-muted">
              {playlist.tracks.length} 首歌曲
            </span>
          </div>
        </div>
      </div>

      {/* Borderless Tracklist Rows */}
      <ProviderAlbumTrackTable tracks={playlist.tracks} actions={trackActions} />
    </section>
  );
}

function DescriptionDisclosure({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = description || "暂无歌单简介";
  const canExpand = text.length > 120;

  return (
    <div className="mt-4 max-w-3xl">
      <p className={`text-xs sm:text-sm leading-relaxed text-foreground-muted/90 ${canExpand && !expanded ? "line-clamp-2" : ""}`}>{text}</p>
      {canExpand ? (
        <button className="mt-1.5 text-xs font-semibold text-accent hover:text-accent-hover transition-colors" onClick={() => setExpanded((current) => !current)} type="button">
          {expanded ? "收起介绍" : "展开介绍"}
        </button>
      ) : null}
    </div>
  );
}

function PlaylistArtwork({ alt, src }: { alt: string; src: string | null }) {
  return <MediaArtwork alt={alt} src={src} rounded="xl" className="shadow-xs" />;
}
