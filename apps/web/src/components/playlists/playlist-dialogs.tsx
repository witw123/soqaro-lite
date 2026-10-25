"use client";

import type { Playlist } from "@soqaro/shared";
import { AnchoredDialog, type AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type {
  LocalPlaylistRecord,
  LocalPlaylistTrackRecord
} from "@/features/playlist/local-playlist";

/** A playlist target the track can be moved into. */
export type PlaylistSelection =
  | { kind: "local"; playlist: LocalPlaylistRecord }
  | { kind: "network"; playlist: Playlist };

/**
 * Dialog surfaces for the playlists workspace (create/edit, move-to-playlist
 * picker, delete confirmation).
 */

export function PlaylistEditorDialog({
  kind,
  title,
  description,
  pending,
  onTitleChange,
  onDescriptionChange,
  onSubmit,
  onCancel
}: {
  kind: "local" | "network";
  title: string;
  description: string;
  pending: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isLocal = kind === "local";
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isLocal ? "新建本地歌单" : "新建网络歌单"}</DialogTitle>
          <DialogDescription>
            {isLocal
              ? "创建时选择本地歌曲目录，歌单会直接读取所选目录中的歌曲。"
              : "网络歌单无需本地目录，可从搜索页保存网易云音乐或 QQ 音乐歌单。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-foreground-muted" htmlFor={`new-${kind}-playlist-title`}>
              歌单名称
            </label>
            <input
              className="mt-1.5 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              id={`new-${kind}-playlist-title`}
              maxLength={160}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="例如：通勤歌单"
              required
              value={title}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted" htmlFor={`new-${kind}-playlist-description`}>
              歌单简介（可选）
            </label>
            <textarea
              className="mt-1.5 min-h-24 w-full resize-y rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              id={`new-${kind}-playlist-description`}
              maxLength={1000}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="写点歌单备注"
              value={description}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
              取消
            </Button>
            <Button disabled={pending || !title.trim()} type="submit">
              {pending ? "创建中…" : "创建歌单"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlaylistMoveDialog({
  anchor,
  track,
  source,
  localPlaylists,
  networkPlaylists,
  pending,
  onCancel,
  onSelect
}: {
  anchor: AnchoredDialogAnchor;
  track: LocalPlaylistTrackRecord;
  source: PlaylistSelection;
  localPlaylists: LocalPlaylistRecord[];
  networkPlaylists: Playlist[];
  pending: boolean;
  onCancel: () => void;
  onSelect: (target: PlaylistSelection) => void;
}) {
  const canMoveToNetwork = Boolean(track.providerTrackId && track.provider !== "local_upload");
  const options: PlaylistSelection[] = [
    ...localPlaylists.map((playlist) => ({ kind: "local" as const, playlist })),
    ...networkPlaylists.map((playlist) => ({ kind: "network" as const, playlist }))
  ];

  return (
    <AnchoredDialog
      anchor={anchor}
      ariaLabelledBy="playlist-move-title"
      className="max-w-md"
      onClose={onCancel}
    >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground" id="playlist-move-title">移动到歌单</h2>
            <p className="mt-1 truncate text-xs text-foreground-muted">《{track.title}》 - {track.artist}</p>
          </div>
          <Button aria-label="关闭" disabled={pending} onClick={onCancel} size="icon" type="button" variant="ghost">
            <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </Button>
        </div>

        {options.length ? (
          <div className="mt-5 space-y-2">
            {options.map((target) => {
              const isSource = source.kind === target.kind && source.playlist.id === target.playlist.id;
              const networkUnavailable = target.kind === "network" && !canMoveToNetwork;
              const disabled = pending || isSource || networkUnavailable;
              return (
                <button
                  aria-disabled={disabled}
                  className="flex w-full items-center gap-3 rounded-xl border border-surface-border bg-background/60 px-3 py-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled}
                  key={`${target.kind}:${target.playlist.id}`}
                  onClick={() => onSelect(target)}
                  title={isSource ? "当前歌单" : networkUnavailable ? "本地上传歌曲只能移动到本地歌单" : undefined}
                  type="button"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="17"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" /><path d="M8 12h8m-3-3 3 3-3 3" /></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{target.playlist.title}</span>
                    <span className="mt-1 block truncate text-xs text-foreground-muted">
                      {`${target.playlist.trackIds.length} 首歌曲`}
                    </span>
                  </span>
                  <svg aria-hidden="true" className="shrink-0 text-foreground-muted" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-foreground-muted">还没有可移动的歌单。</p>
        )}
    </AnchoredDialog>
  );
}

export function DeletePlaylistDialog({
  kind,
  playlist,
  pending,
  onConfirm,
  onCancel
}: {
  kind: "local" | "network";
  playlist: { title: string };
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const label = kind === "local" ? "本地歌单" : "网络歌单";
  return (
    <ConfirmDialog
      open
      title={`删除${label}`}
      description={`确定删除“${playlist.title}”吗？已下载到本地的歌曲不会被删除。`}
      confirmLabel="确认删除"
      destructive
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

