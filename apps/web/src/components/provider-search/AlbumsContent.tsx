import React from "react";
import type { ProviderAlbumDetail, ProviderAlbumSummary } from "@soqaro/shared";
import { ProviderAlbumDetailView, type ProviderAlbumTrackActions } from "./ProviderAlbumDetailView";
import type { AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";
import { Artwork, Icon, SearchEmptyState, albumKey } from "./search-ui-primitives";

export function AlbumsContent({
  albums,
  album,
  pending,
  favoriteAlbumIds,
  onOpen,
  onBack,
  onToggleFavorite,
  onAddAlbumToPlaylist,
  trackActions
}: {
  albums: ProviderAlbumSummary[];
  album: ProviderAlbumDetail | null;
  pending: string | null;
  favoriteAlbumIds: Set<string>;
  onOpen: (item: ProviderAlbumSummary) => Promise<void>;
  onBack: () => void;
  onToggleFavorite: (album: ProviderAlbumSummary | ProviderAlbumDetail) => Promise<void>;
  onAddAlbumToPlaylist: (album: ProviderAlbumDetail, anchor: AnchoredDialogAnchor) => void;
  trackActions: ProviderAlbumTrackActions;
}) {
  if (album) {
    const favoriteId = albumKey(album.provider, album.providerAlbumId);
    return (
      <ProviderAlbumDetailView
        album={album}
        isFavorite={favoriteAlbumIds.has(favoriteId)}
        onAddAlbumToPlaylist={(anchor) => onAddAlbumToPlaylist(album, anchor)}
        onBack={onBack}
        onToggleFavorite={() => onToggleFavorite(album)}
        pending={pending}
        trackActions={trackActions}
      />
    );
  }

  return (
    <section className="mt-7">
      {albums.length ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {albums.map((item) => {
            const favoriteId = albumKey(item.provider, item.providerAlbumId);
            return (
              <article
                className="group flex flex-col min-w-0 rounded-2xl border border-white/[0.08] bg-black/40 p-2 sm:p-2.5 transition duration-200 hover:border-accent/40 hover:bg-white/[0.05]"
                key={`${item.provider}-${item.providerAlbumId}`}
              >
                <button
                  className="block w-full overflow-hidden text-left focus-visible:outline-none"
                  onClick={() => void onOpen(item)}
                  type="button"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface">
                    <Artwork alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" size="lg" src={item.artworkUrl} />
                  </div>
                  <span className="mt-2 block truncate text-xs sm:text-sm font-semibold text-white/85 group-hover:text-accent transition-colors" title={item.title}>
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-white/40">{item.artist}</span>
                </button>
                <button
                  aria-label={favoriteAlbumIds.has(favoriteId) ? `取消收藏${item.title}` : `收藏${item.title}`}
                  className={`mt-2 flex items-center gap-1.5 px-1 text-xs transition ${
                    favoriteAlbumIds.has(favoriteId) ? "text-accent" : "text-white/40 hover:text-white/70"
                  }`}
                  disabled={pending !== null}
                  onClick={() => void onToggleFavorite(item)}
                  type="button"
                >
                  <Icon filled={favoriteAlbumIds.has(favoriteId)} name="heart" />
                  {favoriteAlbumIds.has(favoriteId) ? "已收藏" : "收藏"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <SearchEmptyState description="在搜索框输入关键词，再打开专辑标签。" title="还没有专辑结果" />
      )}
    </section>
  );
}
