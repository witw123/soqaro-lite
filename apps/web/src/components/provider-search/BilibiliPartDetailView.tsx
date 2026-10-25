"use client";

import type { BilibiliTrackCandidate } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/domain/soqaro-ui";
import { MediaArtwork } from "@/components/ui/media-artwork";
import { PlayIcon, ChevronLeftIcon, HeartIcon, ListMusicIcon } from "@/components/icons/DiscoverIcons";
import { Icon } from "./search-ui-primitives";
import type { AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import { getAnchoredDialogAnchor } from "@/components/ui/anchored-dialog";

export type BilibiliPartDetail = {
  bvid: string;
  title: string;
  rawTitle: string;
  artist: string;
  artworkUrl: string | null;
  pageCount: number;
  parts: BilibiliTrackCandidate[];
};

type BilibiliPartDetailViewProps = {
  detail: BilibiliPartDetail;
  onBack: () => void;
  onPlayTrack: (track: BilibiliTrackCandidate) => void;
  onQueueTrack?: (track: BilibiliTrackCandidate) => void;
  onDownloadTrack?: (track: BilibiliTrackCandidate) => void;
  onImportPlaylist?: (track: BilibiliTrackCandidate, anchor: AnchoredDialogAnchor) => void;
  onPlayAll: (tracks: BilibiliTrackCandidate[]) => void;
  pendingTrackId?: string | null;
  isFavorite?: (track: BilibiliTrackCandidate) => boolean;
  onToggleFavorite?: (track: BilibiliTrackCandidate) => void;
  isCollectionFavorite?: boolean;
  onToggleFavoriteCollection?: (detail: BilibiliPartDetail) => Promise<void> | void;
  onSaveCollectionAsPlaylist?: (detail: BilibiliPartDetail) => Promise<void> | void;
  onAddCollectionToPlaylist?: (detail: BilibiliPartDetail, anchor: AnchoredDialogAnchor) => void;
};

export function BilibiliPartDetailView({
  detail,
  onBack,
  onPlayTrack,
  onQueueTrack,
  onDownloadTrack,
  onImportPlaylist,
  onPlayAll,
  pendingTrackId,
  isFavorite,
  onToggleFavorite,
  isCollectionFavorite,
  onToggleFavoriteCollection,
  onSaveCollectionAsPlaylist,
  onAddCollectionToPlaylist
}: BilibiliPartDetailViewProps) {
  const totalDurationMs = detail.parts.reduce((acc, curr) => acc + (curr.durationMs || 0), 0);

  return (
    <section className="mt-3 sm:mt-6 animate-in fade-in duration-300">
      {/* Back Button */}
      <button
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground mb-4 border border-surface-border bg-surface/50"
        onClick={onBack}
        type="button"
      >
        <ChevronLeftIcon className="w-3.5 h-3.5" />
        <span>返回搜索列表</span>
      </button>

      {/* Video Hero Stage */}
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface/40 p-4 sm:p-5 backdrop-blur-md grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-[144px_minmax(0,1fr)] md:grid-cols-[160px_minmax(0,1fr)] items-center sm:items-end">
        <MediaArtwork
          alt={detail.title}
          containerClassName="w-32 sm:w-36 md:w-40 max-w-[160px] mx-auto sm:mx-0 shrink-0 shadow-xs"
          fallbackIcon={<Icon name="music" />}
          loading="eager"
          rounded="xl"
          src={detail.artworkUrl}
        />

        <div className="relative z-10 flex min-w-0 flex-col justify-end text-center sm:text-left">
          <div className="inline-flex items-center justify-center sm:justify-start gap-2 mb-1.5">
            <span className="rounded-md bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 text-xs font-medium">
              哔哩哔哩 视频分P合集
            </span>
            <span className="text-xs font-mono text-foreground-muted">BV号: {detail.bvid}</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground line-clamp-2">
            {detail.title}
          </h1>

          <p className="mt-1.5 text-xs text-foreground-muted flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1">
            <span>UP主: <strong className="text-foreground font-medium">{detail.artist}</strong></span>
            <span>共 {detail.parts.length} 首分P单曲</span>
            {totalDurationMs > 0 && (
              <span>总时长 {formatDuration(totalDurationMs)}</span>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <Button
              size="sm"
              variant="default"
              onClick={() => onPlayAll(detail.parts)}
              className="h-8 rounded-lg px-3.5 text-xs font-medium flex items-center gap-1.5 bg-accent text-white hover:bg-accent-hover shadow-xs transition-colors active:scale-95"
            >
              <PlayIcon className="w-3.5 h-3.5 fill-current" />
              <span>播放全部</span>
            </Button>
            {onToggleFavoriteCollection && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onToggleFavoriteCollection(detail)}
                className={`h-8 rounded-lg px-3 text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                  isCollectionFavorite
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                    : "border-surface-border bg-surface text-foreground hover:bg-surface-hover"
                }`}
              >
                <HeartIcon className="w-3.5 h-3.5" />
                <span>{isCollectionFavorite ? "已收藏合集" : "收藏合集"}</span>
              </Button>
            )}
            {onSaveCollectionAsPlaylist && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onSaveCollectionAsPlaylist(detail)}
                className="h-8 rounded-lg px-3 text-xs font-medium flex items-center gap-1.5 border border-surface-border bg-surface text-foreground hover:bg-surface-hover transition-colors"
              >
                <ListMusicIcon className="w-3.5 h-3.5" />
                <span>保存为歌单</span>
              </Button>
            )}
            {onAddCollectionToPlaylist && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => onAddCollectionToPlaylist(detail, getAnchoredDialogAnchor(e.currentTarget))}
                className="h-8 rounded-lg px-3 text-xs font-medium flex items-center gap-1.5 border border-surface-border bg-surface text-foreground hover:bg-surface-hover transition-colors"
              >
                <Icon name="playlist-add" />
                <span>添加到已有歌单</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Part Tracks List */}
      <div className="mt-5 rounded-xl border border-surface-border bg-surface/40 backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-xs font-medium text-foreground-muted">
            分P列表 ({detail.parts.length})
          </h2>
        </div>

        <div className="divide-y divide-surface-border/40">
          {detail.parts.map((part, index) => {
            const isPending = pendingTrackId === part.providerTrackId;
            const fav = isFavorite ? isFavorite(part) : false;

            return (
              <div
                key={part.providerTrackId}
                className="group flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-hover"
              >
                <div
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  onClick={() => onPlayTrack(part)}
                >
                  <span className="w-6 text-center text-xs tabular-nums text-foreground-muted/70 group-hover:text-foreground font-mono">
                    {isPending ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent align-middle" />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                      {part.title}
                    </p>
                    <p className="text-xs text-foreground-muted truncate">
                      {part.artist}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-foreground-muted/60 tabular-nums font-mono mr-1">
                    {formatDuration(part.durationMs)}
                  </span>

                  <button
                    type="button"
                    title="播放这首"
                    disabled={Boolean(pendingTrackId)}
                    onClick={() => onPlayTrack(part)}
                    className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover transition disabled:opacity-40"
                  >
                    {isPending ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    ) : (
                      <PlayIcon className="w-3.5 h-3.5 fill-current" />
                    )}
                  </button>

                  {onQueueTrack && (
                    <button
                      type="button"
                      title="加入播放队列"
                      disabled={Boolean(pendingTrackId)}
                      onClick={() => onQueueTrack(part)}
                      className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover transition disabled:opacity-40"
                    >
                      <Icon name="playlist-add" />
                    </button>
                  )}

                  {onDownloadTrack && (
                    <button
                      type="button"
                      title="下载到本地"
                      disabled={Boolean(pendingTrackId)}
                      onClick={() => onDownloadTrack(part)}
                      className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover transition disabled:opacity-40"
                    >
                      <Icon name="download" />
                    </button>
                  )}

                  {onImportPlaylist && (
                    <button
                      type="button"
                      title="保存到歌单"
                      disabled={Boolean(pendingTrackId)}
                      onClick={(e) => onImportPlaylist(part, getAnchoredDialogAnchor(e.currentTarget))}
                      className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover transition disabled:opacity-40"
                    >
                      <Icon name="playlist-add" />
                    </button>
                  )}

                  {onToggleFavorite && (
                    <button
                      type="button"
                      title={fav ? "取消收藏" : "收藏"}
                      onClick={() => onToggleFavorite(part)}
                      className={`p-1.5 rounded-lg transition ${
                        fav ? "text-rose-500" : "text-foreground-muted hover:text-rose-500 hover:bg-surface-hover"
                      }`}
                    >
                      <Icon name="heart" filled={fav} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
