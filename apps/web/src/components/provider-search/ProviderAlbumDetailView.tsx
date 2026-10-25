"use client";

import { useEffect, useState } from "react";
import type {
  ProviderAlbumDetail,
  ProviderTrackCandidate
} from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import { FavoriteTrackButton } from "@/components/ui/FavoriteTrackButton";
import { MobileTrackActionsMenu, type MobileTrackAction } from "@/components/ui/MobileTrackActionsMenu";
import { formatDuration } from "@/lib/domain/soqaro-ui";
import { getAnchoredDialogAnchor, type AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import { MediaArtwork } from "@/components/ui/media-artwork";
import {
  PlayIcon,
  HeartIcon,
  ChevronLeftIcon,
  CheckIcon
} from "@/components/icons/DiscoverIcons";

type Track = ProviderTrackCandidate;

export type ProviderAlbumTrackActions = {
  isDownloaded?: (track: Track) => boolean;
  isPlayable?: (track: Track) => boolean;
  isQueueable?: (track: Track) => boolean;
  isQueued?: (track: Track) => boolean;
  isDownloading?: (track: Track) => boolean;
  isPreparingPlayback?: (track: Track) => boolean;
  onDownload?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onPlay?: (track: Track) => void;
  onAddToPlaylist?: (track: Track, anchor: AnchoredDialogAnchor) => void;
  isFavorite?: (track: Track) => boolean;
  onToggleFavorite?: (track: Track) => void | Promise<void>;
  isTogglingFavorite?: (track: Track) => boolean;
  isInRoom?: (track: Track) => boolean;
  isImporting?: (track: Track) => boolean;
  onImport?: (track: Track) => void;
};

type ProviderAlbumDetailViewProps = {
  album: ProviderAlbumDetail;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: () => Promise<void>;
  pending: string | null;
  onAddAlbumToPlaylist?: (anchor: AnchoredDialogAnchor) => void;
  trackActions?: ProviderAlbumTrackActions;
};

export function ProviderAlbumDetailView({
  album,
  isFavorite,
  onBack,
  onToggleFavorite,
  pending,
  onAddAlbumToPlaylist,
  trackActions
}: ProviderAlbumDetailViewProps) {
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

      {/* Album Hero Stage */}
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface/40 p-4 sm:p-5 backdrop-blur-md grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-[144px_minmax(0,1fr)] md:grid-cols-[160px_minmax(0,1fr)] items-center sm:items-end">
        <div className="w-32 sm:w-36 md:w-40 max-w-[160px] mx-auto sm:mx-0 shrink-0">
          <AlbumArtwork alt={album.title} src={album.artworkUrl} />
        </div>
        <div className="relative z-10 flex min-w-0 flex-col justify-end text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <span className="inline-flex items-center rounded-md bg-surface border border-surface-border px-2 py-0.5 text-xs font-medium text-foreground-muted">
              专辑
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{album.title}</h1>
          <p className="mt-1 text-xs text-foreground-muted font-medium">
            {album.artist} / {album.releaseTime || "发行时间未知"} / {album.tracks.length} 首歌曲
          </p>
          <DescriptionDisclosure description={album.description} />
          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            {album.tracks[0] && trackActions?.onPlay ? (
              <button
                type="button"
                onClick={() => trackActions.onPlay?.(album.tracks[0])}
                className="inline-flex h-8 items-center gap-1.5 px-3.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-xs transition-colors active:scale-95"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                <span>播放专辑</span>
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
              <span>{isFavorite ? "已收藏" : "收藏专辑"}</span>
            </Button>
            {onAddAlbumToPlaylist ? (
              <Button
                aria-label="将专辑加入歌单"
                disabled={pending !== null}
                onClick={(event) => onAddAlbumToPlaylist(getAnchoredDialogAnchor(event.currentTarget))}
                size="icon"
                title="将专辑加入歌单"
                type="button"
                variant="ghost"
                className="h-8 w-8 rounded-lg border border-surface-border bg-surface hover:bg-surface-hover text-foreground-muted hover:text-foreground"
              >
                <Icon name="plus" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tracklist Table */}
      <ProviderAlbumTrackTable tracks={album.tracks} actions={trackActions} />
    </section>
  );
}

function DescriptionDisclosure({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = description || "暂无专辑简介";
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

export function ProviderAlbumTrackTable({
  tracks,
  actions,
  showToolbar = true,
  selectedTrackIds,
  onToggleSelect,
  selectablePredicate
}: {
  tracks: Track[];
  actions?: ProviderAlbumTrackActions;
  showToolbar?: boolean;
  selectedTrackIds?: string[];
  onToggleSelect?: (trackId: string) => void;
  selectablePredicate?: (track: Track) => boolean;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTracks = normalizedQuery
    ? tracks.filter((track) => `${track.title} ${track.artist} ${track.album ?? ""}`.toLowerCase().includes(normalizedQuery))
    : tracks;

  // 大歌单(数百行)一次性渲染会卡顿;按批渐进渲染,与 TrackListSection 相同策略。
  const [renderedCount, setRenderedCount] = useState(50);
  useEffect(() => {
    if (renderedCount >= visibleTracks.length) return;
    const timer = window.setTimeout(() => {
      setRenderedCount((prev) => Math.min(prev + 50, visibleTracks.length));
    }, 40);
    return () => window.clearTimeout(timer);
  }, [renderedCount, visibleTracks.length]);
  useEffect(() => {
    setRenderedCount(50);
  }, [normalizedQuery]);
  const renderedTracks = visibleTracks.slice(0, renderedCount);

  return (
    <section className={showToolbar ? "mt-6" : "mt-1"}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-sm sm:text-base font-bold text-foreground tracking-tight">歌曲列表</span>
            <span className="text-xs font-medium text-foreground-muted px-2 py-0.5 rounded-full bg-surface border border-surface-border">
              {tracks.length} 首
            </span>
          </div>
          <label className="flex h-8 sm:h-9 w-full max-w-[240px] items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 text-foreground-muted sm:w-auto">
            <Icon name="search" />
            <span className="sr-only">搜索曲目</span>
            <input
              aria-label="搜索曲目"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground-muted/50"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="在列表中搜索..."
              type="search"
              value={query}
            />
          </label>
        </div>
      ) : null}

      {/* Borderless Smooth Tracklist Rows */}
      <div className="space-y-0.5">
        {renderedTracks.length ? (
          renderedTracks.map((track, index) => {
            const trackKey = `${track.provider}:${track.providerTrackId}`;
            const isSelected = selectedTrackIds?.includes(trackKey) ?? false;
            const isSelectable = selectablePredicate ? selectablePredicate(track) : true;
            return (
              <div
                className={`group flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl transition-all hover:bg-surface-hover/60 border border-transparent hover:border-surface-border/40 min-h-[44px] sm:min-h-[48px] ${
                  actions?.onPlay ? "cursor-pointer" : ""
                } ${isSelected ? "bg-accent/5 border-accent/20" : ""}`}
                key={trackKey}
                onClick={() => {
                  if (!actions?.onPlay || !actions.isPlayable?.(track) || actions.isDownloading?.(track) || actions.isPreparingPlayback?.(track)) return;
                  actions.onPlay(track);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  if (!actions?.onPlay || !actions.isPlayable?.(track) || actions.isDownloading?.(track) || actions.isPreparingPlayback?.(track)) return;
                  event.preventDefault();
                  actions.onPlay(track);
                }}
                tabIndex={actions?.onPlay ? 0 : undefined}
              >
                {/* Checkbox (if enabled) & Index number or Play Icon */}
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                  {onToggleSelect ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelectable}
                      onChange={(event) => {
                        event.stopPropagation();
                        onToggleSelect(trackKey);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 shrink-0 rounded accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`选择《${track.title}》`}
                    />
                  ) : null}

                  <div className="hidden sm:flex w-7 shrink-0 items-center justify-center text-xs font-mono tabular-nums text-foreground-muted/60">
                    <span className="group-hover:hidden">{String(index + 1).padStart(2, "0")}</span>
                    <PlayIcon className="hidden group-hover:block w-3.5 h-3.5 text-accent animate-fade-in" />
                  </div>

                  {/* Track Artwork Thumbnail */}
                  <TrackArtwork alt={track.album ?? track.title} src={track.artworkUrl} />

                  {/* Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] sm:text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-foreground-muted mt-0.5">
                      {track.artist}
                      {track.album ? ` / ${track.album}` : ""}
                    </p>
                  </div>
                </div>

                {/* Album (Desktop only) */}
                <span className="hidden lg:block min-w-0 max-w-[200px] truncate text-xs text-foreground-muted/70">
                  {track.album ?? "未知专辑"}
                </span>

                {/* Duration */}
                <span className="hidden sm:inline-block shrink-0 text-xs font-mono text-foreground-muted/60 tabular-nums px-2">
                  {formatDuration(track.durationMs)}
                </span>

                {/* Action Buttons */}
                {actions ? <TrackActions track={track} actions={actions} /> : null}
              </div>
            );
          })
        ) : (
          <p className="px-4 py-12 text-center text-xs text-foreground-muted">没有匹配的歌曲。</p>
        )}
      </div>
    </section>
  );
}

function TrackActions({ track, actions }: { track: Track; actions: ProviderAlbumTrackActions }) {
  const [menuAnchor, setMenuAnchor] = useState<AnchoredDialogAnchor | null>(null);
  const downloaded = actions.isDownloaded?.(track) ?? false;
  const playable = actions.isPlayable?.(track) ?? false;
  const queueable = actions.isQueueable?.(track) ?? playable;
  const queued = actions.isQueued?.(track) ?? false;
  const downloading = actions.isDownloading?.(track) ?? false;
  const preparingPlayback = actions.isPreparingPlayback?.(track) ?? false;
  const inRoom = actions.isInRoom?.(track) ?? false;
  const importing = actions.isImporting?.(track) ?? false;
  const disabled = downloading || preparingPlayback || importing;

  const menuItems: MobileTrackAction[] = [
    ...(actions.onPlay ? [{ id: "play", label: preparingPlayback ? "准备播放中" : playable ? "播放" : "需要下载后播放", icon: "play" as const, disabled: disabled || !playable, onSelect: () => actions.onPlay?.(track) }] : []),
    ...(actions.onImport ? [{ id: "import", label: inRoom ? "已在曲库" : importing ? "加入中…" : "加入曲库", icon: "plus" as const, disabled: inRoom || importing, onSelect: () => actions.onImport?.(track) }] : []),
    ...(actions.onDownload ? [{ id: "download", label: downloaded ? "已下载" : downloading ? "下载中" : "下载到本地", icon: "download" as const, disabled: disabled || downloaded, onSelect: () => actions.onDownload?.(track) }] : []),
    ...(actions.onAddToQueue ? [{ id: "queue", label: queued ? "已在队列中" : queueable ? "加入队列" : "需要下载后加入队列", icon: "queue" as const, disabled: disabled || queued || !queueable, onSelect: () => actions.onAddToQueue?.(track) }] : []),
    ...(actions.onAddToPlaylist ? [{ id: "playlist", label: "加入歌单", icon: "plus" as const, disabled, onSelect: () => { if (menuAnchor) actions.onAddToPlaylist?.(track, menuAnchor); } }] : []),
    ...(actions.onToggleFavorite ? [{ id: "favorite", label: actions.isFavorite?.(track) ? "取消收藏" : "收藏歌曲", icon: "heart" as const, disabled: actions.isTogglingFavorite?.(track) ?? false, onSelect: () => void actions.onToggleFavorite?.(track) }] : [])
  ];

  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
      <div className="hidden items-center gap-1 sm:flex opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
        {actions.onImport ? (
          inRoom ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              <CheckIcon className="h-3 w-3" />
              <span>已在曲库</span>
            </span>
          ) : (
            <Button
              aria-label={`将《${track.title}》加入曲库`}
              className="h-7 rounded-md px-2.5 text-xs font-medium border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 transition-colors"
              disabled={disabled || importing}
              onClick={() => actions.onImport?.(track)}
              size="sm"
              title="加入曲库"
              type="button"
              variant="ghost"
            >
              {importing ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg aria-hidden="true" className="animate-spin" fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="12">
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  <span>加入中…</span>
                </span>
              ) : (
                <span>加入曲库</span>
              )}
            </Button>
          )
        ) : null}
        {actions.onDownload ? (
          <Button
            aria-label={downloaded ? `《${track.title}》已下载` : `下载《${track.title}》`}
            className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
            disabled={disabled || downloaded}
            onClick={() => actions.onDownload?.(track)}
            size="icon"
            title={downloaded ? "已下载" : downloading ? "下载中" : "下载到本地"}
            type="button"
            variant="ghost"
          >
            {downloading ? (
              <svg aria-hidden="true" className="animate-spin" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            ) : (
              <TrackActionIcon name="download" />
            )}
          </Button>
        ) : null}
        {actions.onAddToQueue ? (
          <Button
            aria-label={queued ? `《${track.title}》已在队列中` : `将《${track.title}》加入队列`}
            className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
            disabled={disabled || queued || !queueable}
            onClick={() => actions.onAddToQueue?.(track)}
            size="icon"
            title={queued ? "已在队列中" : queueable ? "加入队列" : "需要下载后加入队列"}
            type="button"
            variant="ghost"
          >
            <TrackActionIcon name="queue" />
          </Button>
        ) : null}
        {actions.onAddToPlaylist ? (
          <Button
            aria-label={`将《${track.title}》加入歌单`}
            className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
            disabled={disabled}
            onClick={(event) => actions.onAddToPlaylist?.(track, getAnchoredDialogAnchor(event.currentTarget))}
            size="icon"
            title="加入歌单"
            type="button"
            variant="ghost"
          >
            <TrackActionIcon name="plus" />
          </Button>
        ) : null}
        {actions.onToggleFavorite ? (
          <FavoriteTrackButton
            isFavorite={actions.isFavorite?.(track) ?? false}
            onToggle={() => actions.onToggleFavorite?.(track)}
            pending={actions.isTogglingFavorite?.(track) ?? false}
            size="compact"
            track={track as ProviderTrackCandidate}
          />
        ) : null}
      </div>
      {actions.onDownload ? (
        <Button
          aria-label={downloaded ? `《${track.title}》已下载` : `下载《${track.title}》`}
          className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground sm:hidden"
          disabled={disabled || downloaded}
          onClick={() => actions.onDownload?.(track)}
          size="icon"
          title={downloaded ? "已下载" : downloading ? "下载中" : "下载到本地"}
          type="button"
          variant="ghost"
        >
          {downloading ? (
            <svg aria-hidden="true" className="animate-spin" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : (
            <TrackActionIcon name="download" />
          )}
        </Button>
      ) : null}
      <Button
        aria-label={`打开《${track.title}》的操作菜单`}
        className="h-8 w-8 sm:hidden text-foreground-muted hover:text-foreground"
        onClick={(event) => { event.stopPropagation(); setMenuAnchor(getAnchoredDialogAnchor(event.currentTarget)); }}
        size="icon"
        variant="ghost"
      >
        <MoreIcon />
      </Button>
      {menuAnchor ? (
        <MobileTrackActionsMenu
          anchor={menuAnchor}
          items={menuItems}
          onClose={() => setMenuAnchor(null)}
          subtitle={`${track.artist}${track.album ? ` / ${track.album}` : ""}`}
          title={track.title}
        />
      ) : null}
    </div>
  );
}

function MoreIcon() {
  return <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>;
}

function AlbumArtwork({ alt, src }: { alt: string; src: string | null }) {
  return <MediaArtwork alt={alt} src={src} rounded="xl" className="shadow-xs" />;
}

function TrackArtwork({ alt, src }: { alt: string; src: string | null }) {
  return <MediaArtwork alt={alt} src={src} rounded="lg" containerClassName="h-9 w-9" className="shadow-xs" />;
}

function Icon({ name }: { name: "search" | "plus" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

function TrackActionIcon({ name }: { name: "download" | "queue" | "play" | "plus" | "loading" }) {
  if (name === "download") return <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>;
  if (name === "queue") return <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14"><path d="M4 6h11M4 12h11M4 18h6M18 14v7M14.5 17.5h7" /></svg>;
  if (name === "play") return <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14"><path d="M8 5v14l11-7z" /></svg>;
  if (name === "plus") return <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14"><path d="M12 5v14M5 12h14" /></svg>;
  return <svg aria-hidden="true" className="animate-spin" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14"><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
}
