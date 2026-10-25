import React from "react";
import type { Track } from "./discover-types";
import type { AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import {
  ProviderPlaylistPickerDialog,
  type ProviderPlaylistPickerOption
} from "@/components/provider-search";
import { CompassIcon as DiscoverCompassIcon } from "@/components/icons/DiscoverIcons";

export function PlaylistPicker({
  track,
  anchor,
  options,
  loading,
  pending,
  onClose,
  onSelect
}: {
  track: Track | null;
  anchor: AnchoredDialogAnchor | null;
  options: ProviderPlaylistPickerOption[];
  loading: boolean;
  pending: string | null;
  onClose: () => void;
  onSelect: (option: ProviderPlaylistPickerOption) => Promise<void>;
}) {
  if (!track || !anchor) return null;
  return (
    <ProviderPlaylistPickerDialog
      anchor={anchor}
      loading={loading}
      options={options}
      pending={pending !== null}
      subjectLabel={`《${track.title}》 - ${track.artist}`}
      onClose={onClose}
      onSelect={(option) => void onSelect(option)}
    />
  );
}

export function Feedback({
  statusMessage,
  errorMessage
}: {
  statusMessage: string | null;
  errorMessage: string | null;
}) {
  return (
    <>
      {statusMessage ? (
        <p className="mt-5 rounded-2xl bg-white/[0.06] border border-white/[0.08] px-4 py-3 text-xs text-white" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-5 rounded-2xl bg-red-950/30 border border-red-500/20 px-4 py-3 text-xs text-red-300" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}

export function DiscoverEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  onAction
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <section className="mt-8 flex min-h-60 flex-col items-center justify-center rounded-2xl border border-surface-border bg-surface-elevated px-6 py-10 text-center shadow-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface text-foreground-muted mb-3.5">
        <DiscoverCompassIcon className="w-6 h-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-sm text-xs text-foreground-muted leading-relaxed">{description}</p>
      {actionHref ? (
        <a className="mt-4 rounded-xl bg-accent hover:bg-accent-hover px-5 py-2 text-xs font-medium text-white transition-all shadow-sm" href={actionHref}>
          {actionLabel}
        </a>
      ) : (
        <button className="mt-4 rounded-xl bg-accent hover:bg-accent-hover px-5 py-2 text-xs font-medium text-white transition-all shadow-sm active:scale-95" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </section>
  );
}

export function DiscoverSkeleton() {
  return (
    <div aria-label="正在加载个性化发现内容" className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="animate-pulse p-2.5 rounded-xl bg-surface/50 border border-surface-border" key={index}>
          <div className="aspect-square rounded-lg bg-surface-elevated" />
          <div className="mt-3 h-3 w-4/5 rounded bg-surface-elevated" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-surface-elevated" />
        </div>
      ))}
    </div>
  );
}

export function AppPageBackground() {
  return <div aria-hidden="true" className="workspace-page-background" />;
}
