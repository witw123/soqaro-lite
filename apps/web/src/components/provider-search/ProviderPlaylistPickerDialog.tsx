"use client";

import Link from "next/link";
import { Music, ChevronRight, X } from "lucide-react";
import type { Playlist } from "@soqaro/shared";
import { AnchoredDialog, type AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import { Button } from "@/components/ui/button";

export type ProviderPlaylistPickerOption = {
  kind: "network";
  playlist: Playlist;
};

export function ProviderPlaylistPickerDialog({
  anchor,
  loading,
  options,
  pending,
  subjectLabel,
  onClose,
  onSelect
}: {
  anchor: AnchoredDialogAnchor;
  loading: boolean;
  options: ProviderPlaylistPickerOption[];
  pending: boolean;
  subjectLabel: string;
  onClose: () => void;
  onSelect: (option: ProviderPlaylistPickerOption) => void;
}) {
  return (
    <AnchoredDialog anchor={anchor} ariaLabelledBy="provider-playlist-picker-title" className="max-w-md" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground" id="provider-playlist-picker-title">选择目标歌单</h2>
          <p className="mt-1 truncate text-xs text-foreground-muted">{subjectLabel}</p>
        </div>
        <Button
          aria-label="关闭"
          disabled={pending}
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
          className="h-7 w-7 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {loading ? <p className="mt-6 text-center text-sm text-foreground-muted">正在加载可用歌单…</p> : null}
      {!loading && options.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-foreground-muted">还没有可添加的歌单。</p>
          <Link className="mt-3 inline-block text-sm text-accent hover:text-accent/80" href="/app/playlists">前往歌单页创建</Link>
        </div>
      ) : null}
      {options.length ? (
        <section className="mt-5 first:mt-6">
          <h3 className="mb-2 text-xs font-semibold text-foreground-muted">歌单</h3>
          <div className="space-y-2">
            {options.map((option) => {
              const item = option.playlist;
              return (
                <button
                  className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  key={`${option.kind}:${item.id}`}
                  onClick={() => onSelect(option)}
                  type="button"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Music className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-foreground-muted">{item.trackIds.length} 首歌曲</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground-muted" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </AnchoredDialog>
  );
}
