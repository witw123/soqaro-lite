import React from "react";
import type { Track } from "./discover-types";
import type { DiscoverArtistItem } from "./discover-curation";
import { DiscoverSection } from "./DiscoverSection";
import { Artwork } from "./DiscoverPlaylistRail";
import { PlayIcon } from "@/components/icons/DiscoverIcons";

export function DiscoverArtistRail({
  artists,
  onStartRadio,
  pending
}: {
  artists: DiscoverArtistItem[];
  onStartRadio: (track: Track) => Promise<void>;
  pending: string | null;
}) {
  if (!artists.length) return null;
  return (
    <DiscoverSection
      title="常听艺人"
      subtitle="开启单曲漫游与相关推荐"
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {artists.map((item) => {
          return (
            <button
              key={item.artistName}
              type="button"
              disabled={pending !== null}
              onClick={() => void onStartRadio(item.representativeTrack)}
              className="group flex flex-col items-center text-center p-2 rounded-xl transition-colors hover:bg-surface/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none cursor-pointer"
              title={`开启 ${item.artistName} 漫游电台`}
            >
              <div className="relative aspect-square w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-surface border border-surface-border shadow-xs transition-transform duration-200 group-hover:scale-105">
                <Artwork
                  alt={item.artistName}
                  className="h-full w-full object-cover block"
                  src={item.artworkUrl}
                />
                <span className="pointer-events-none absolute inset-0 bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition duration-150 group-hover:opacity-100 scale-90 group-hover:scale-100">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-md">
                    <PlayIcon className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                </span>
              </div>
              <p className="mt-2 truncate w-full text-xs font-medium text-foreground transition-colors group-hover:text-accent">
                {item.artistName}
              </p>
              <p className="mt-0.5 truncate w-full text-xs text-foreground-muted">
                艺人
              </p>
            </button>
          );
        })}
      </div>
    </DiscoverSection>
  );
}
