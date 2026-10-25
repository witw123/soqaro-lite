"use client";

import React, { useState, type DragEvent } from "react";
import type { LocalPlaylistTrackRecord } from "@/features/playlist/local-playlist";
import { toCachedProviderTrack } from "@/features/playlist/local-playlist";
import { formatDuration } from "@/lib/domain/soqaro-ui";
import { FavoriteTrackButton } from "@/components/ui/FavoriteTrackButton";
import { MobileTrackActionsMenu, type MobileTrackAction } from "@/components/ui/MobileTrackActionsMenu";
import { getAnchoredDialogAnchor, type AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import { Button } from "@/components/ui/button";
import { Artwork } from "./playlist-artwork";

export function LocalTrackRow({
  track,
  index,
  isCurrent,
  isPlayable,
  isQueueable,
  isQueued,
  onAddToQueue,
  onDownload,
  onMove,
  onMoveOrder,
  onPlay,
  onRemove,
  isFavorite = false,
  isTogglingFavorite = false,
  onToggleFavorite,
  isDownloading = false,
  isPreparingPlayback = false,
  draggable = false,
  isDragTarget = false,
  total,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  track: LocalPlaylistTrackRecord;
  index: number;
  isCurrent: boolean;
  isPlayable: boolean;
  isQueueable: boolean;
  isQueued: boolean;
  onAddToQueue: () => void;
  onDownload?: () => void;
  onMove?: (anchor: AnchoredDialogAnchor) => void;
  onMoveOrder?: (direction: -1 | 1) => void;
  total: number;
  onPlay: () => void;
  onRemove?: () => void;
  isFavorite?: boolean;
  isTogglingFavorite?: boolean;
  onToggleFavorite?: () => void;
  isDownloading?: boolean;
  isPreparingPlayback?: boolean;
  draggable?: boolean;
  isDragTarget?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<AnchoredDialogAnchor | null>(null);
  const canFavorite =
    !!onToggleFavorite &&
    (track.provider === "netease" || track.provider === "qqmusic") &&
    !!track.providerTrackId;
  const menuItems: MobileTrackAction[] = [
    {
      id: "play",
      label: isPreparingPlayback ? "准备播放中" : isPlayable ? "播放" : "需要下载后播放",
      icon: "play",
      disabled: isPreparingPlayback || !isPlayable,
      onSelect: onPlay
    },
    ...(onDownload
      ? [
          {
            id: "download",
            label: track.availableOffline ? "已下载" : isDownloading ? "下载中" : "下载到本地",
            icon: "download" as const,
            disabled: track.availableOffline || isDownloading || isPreparingPlayback,
            onSelect: onDownload
          }
        ]
      : []),
    {
      id: "queue",
      label: isQueued ? "已在队列中" : isQueueable ? "加入队列" : "需要下载后加入队列",
      icon: "queue",
      disabled: isQueued || !isQueueable || isPreparingPlayback,
      onSelect: onAddToQueue
    },
    ...(canFavorite
      ? [
          {
            id: "favorite",
            label: isFavorite ? "取消收藏" : "收藏歌曲",
            icon: "heart" as const,
            disabled: isTogglingFavorite,
            onSelect: onToggleFavorite as () => void
          }
        ]
      : []),
    ...(onMoveOrder
      ? [
          {
            id: "up",
            label: "上移",
            icon: "up" as const,
            disabled: index === 0,
            onSelect: () => onMoveOrder(-1)
          },
          {
            id: "down",
            label: "下移",
            icon: "down" as const,
            disabled: index === total - 1,
            onSelect: () => onMoveOrder(1)
          }
        ]
      : []),
    ...(onMove
      ? [
          {
            id: "move",
            label: "移动到其他歌单",
            icon: "move" as const,
            disabled: !track.providerTrackId && track.provider !== "local_upload",
            onSelect: () => {
              if (menuAnchor) onMove(menuAnchor);
            }
          }
        ]
      : []),
    ...(onRemove
      ? [{ id: "remove", label: "从歌单移除", icon: "trash" as const, destructive: true, onSelect: onRemove }]
      : [])
  ];

  return (
    <article
      className={`group flex items-center justify-between gap-2 px-2 py-2 sm:gap-3 sm:px-3 rounded-xl transition-all border border-transparent hover:bg-surface-hover/60 hover:border-surface-border/40 ${
        isPlayable ? "cursor-pointer" : ""
      } ${isCurrent ? "bg-accent/10 text-accent" : ""} ${
        isDragTarget ? "bg-accent/15" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragOver={(event: DragEvent<HTMLElement>) => {
        if (!onDragOver) return;
        event.preventDefault();
        onDragOver();
      }}
      onDragStart={(event: DragEvent<HTMLElement>) => {
        if (!onDragStart) return;
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        if (!onDrop) return;
        event.preventDefault();
        onDrop();
      }}
      onClick={() => {
        if (!isPlayable || isPreparingPlayback || isDownloading) return;
        onPlay();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!isPlayable || isPreparingPlayback || isDownloading) return;
        event.preventDefault();
        onPlay();
      }}
      tabIndex={isPlayable ? 0 : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-6 shrink-0 flex items-center justify-center text-xs font-semibold tabular-nums text-foreground-muted">
          <span className="group-hover:hidden">{String(index + 1).padStart(2, "0")}</span>
          <svg
            aria-hidden="true"
            className="hidden group-hover:block w-3.5 h-3.5 text-accent animate-fade-in"
            fill="currentColor"
            height="14"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <Artwork artworkUrl={track.artworkUrl} title={track.title} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
            {track.title}
          </p>
          <p className="truncate text-xs text-foreground-muted mt-0.5">
            {track.artist}
            {track.album ? ` / ${track.album}` : ""}
          </p>
        </div>
      </div>
      <span className="hidden lg:block min-w-0 max-w-[200px] truncate text-xs text-foreground-muted/70">
        {track.album ?? "未知专辑"}
      </span>
      <span className="shrink-0 text-xs font-mono text-foreground-muted tabular-nums px-2">
        {formatDuration(track.durationMs)}
      </span>
      <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
        <div className="hidden items-center gap-1 sm:flex">
          {onDownload ? (
            <Button
              aria-label={track.availableOffline ? `《${track.title}》已下载` : `下载《${track.title}》`}
              className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
              disabled={track.availableOffline || isDownloading || isPreparingPlayback}
              onClick={onDownload}
              size="icon"
              title={track.availableOffline ? "已下载" : isDownloading ? "下载中" : "下载到本地"}
              type="button"
              variant="ghost"
            >
              {isDownloading ? (
                <svg
                  aria-hidden="true"
                  className="animate-spin"
                  fill="none"
                  height="14"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                  width="14"
                >
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
              ) : (
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
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                </svg>
              )}
            </Button>
          ) : null}
          <Button
            aria-label={isQueued ? `《${track.title}》已在队列中` : `将《${track.title}》加入队列`}
            className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
            disabled={isQueued || !isQueueable || isPreparingPlayback}
            onClick={onAddToQueue}
            size="icon"
            title={isQueued ? "已在队列中" : isQueueable ? "加入队列" : "需要下载后加入队列"}
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
              <path d="M4 6h11M4 12h11M4 18h6M18 14v7M14.5 17.5h7" />
            </svg>
          </Button>
          {onMove ? (
            <Button
              aria-label={`移动《${track.title}》到其他歌单`}
              className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-hover/60"
              disabled={!track.providerTrackId && track.provider !== "local_upload"}
              onClick={(event) => onMove(getAnchoredDialogAnchor(event.currentTarget))}
              size="icon"
              title="移动到其他歌单"
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
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Button>
          ) : null}
          {canFavorite ? (
            <FavoriteTrackButton
              isFavorite={isFavorite}
              onToggle={onToggleFavorite!}
              pending={isTogglingFavorite}
              size="compact"
              track={toCachedProviderTrack(track)}
            />
          ) : null}
          {onRemove ? (
            <Button
              aria-label={`从歌单移除《${track.title}》`}
              className="h-8 w-8 rounded-lg text-foreground-muted hover:text-red-400 hover:bg-red-500/10"
              onClick={onRemove}
              size="icon"
              title="从歌单移除"
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
        </div>
        {onDownload ? (
          <Button
            aria-label={track.availableOffline ? `《${track.title}》已下载` : `下载《${track.title}》`}
            className="h-8 w-8 rounded-lg text-foreground-muted hover:text-foreground sm:hidden"
            disabled={track.availableOffline || isDownloading || isPreparingPlayback}
            onClick={onDownload}
            size="icon"
            title={track.availableOffline ? "已下载" : isDownloading ? "下载中" : "下载到本地"}
            type="button"
            variant="ghost"
          >
            {isDownloading ? (
              <svg
                aria-hidden="true"
                className="animate-spin"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                width="14"
              >
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            ) : (
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
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
              </svg>
            )}
          </Button>
        ) : null}
        <Button
          aria-label={`打开《${track.title}》的操作菜单`}
          className="h-8 w-8 sm:hidden text-foreground-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            setMenuAnchor(getAnchoredDialogAnchor(event.currentTarget));
          }}
          size="icon"
          title="更多操作"
          type="button"
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
    </article>
  );
}

export function PlaylistOrderButtons({
  index,
  onMove,
  title,
  total
}: {
  index: number;
  onMove?: (direction: -1 | 1) => void;
  title: string;
  total: number;
}) {
  if (!onMove) return null;

  return (
    <div className="flex items-center gap-0.5 sm:hidden">
      <Button
        aria-label={`上移《${title}》`}
        className="h-10 w-10 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        size="icon"
        title="上移"
        type="button"
        variant="ghost"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="16"
          viewBox="0 0 24 24"
          width="16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="m6 14 6-6 6 6" />
        </svg>
      </Button>
      <Button
        aria-label={`下移《${title}》`}
        className="h-10 w-10 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        size="icon"
        title="下移"
        type="button"
        variant="ghost"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="16"
          viewBox="0 0 24 24"
          width="16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="m6 10 6 6 6-6" />
        </svg>
      </Button>
    </div>
  );
}

export function MoreIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}
