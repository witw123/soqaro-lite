import React from "react";
import type { ProviderPlaylistDetail, ProviderPlaylistSummary } from "@soqaro/shared";
import { ProviderPlaylistDetailView } from "./ProviderPlaylistDetailView";
import type { ProviderAlbumTrackActions } from "./ProviderAlbumDetailView";
import { Artwork, SearchEmptyState } from "./search-ui-primitives";

export function PlaylistsContent({
  playlists,
  playlist,
  pending,
  onBack,
  onOpen,
  onSave,
  trackActions,
  isFavorite = false
}: {
  playlists: ProviderPlaylistSummary[];
  playlist: ProviderPlaylistDetail | null;
  pending: string | null;
  onBack: () => void;
  onOpen: (item: ProviderPlaylistSummary) => Promise<void>;
  onSave: (playlist: ProviderPlaylistDetail) => Promise<void>;
  trackActions: ProviderAlbumTrackActions;
  isFavorite?: boolean;
}) {
  if (playlist) {
    return (
      <ProviderPlaylistDetailView
        isFavorite={isFavorite}
        onBack={onBack}
        onToggleFavorite={() => onSave(playlist)}
        pending={pending}
        playlist={playlist}
        trackActions={trackActions}
      />
    );
  }

  return (
    <section className="mt-7">
      {playlists.length ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {playlists.map((item) => (
            <button
              className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 p-2 sm:p-2.5 text-left transition duration-200 hover:border-accent/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              key={`${item.provider}-${item.providerPlaylistId}`}
              onClick={() => void onOpen(item)}
              type="button"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface">
                <Artwork alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" size="lg" src={item.artworkUrl} />
              </div>
              <span className="mt-2 block truncate text-xs sm:text-sm font-semibold text-white/85 group-hover:text-accent transition-colors" title={item.title}>
                {item.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/40">
                {item.creatorName ?? "网络歌单"} / {item.trackCount} 首
              </span>
            </button>
          ))}
        </div>
      ) : (
        <SearchEmptyState description="在搜索框输入关键词，再打开歌单标签。" title="还没有歌单结果" />
      )}
    </section>
  );
}
