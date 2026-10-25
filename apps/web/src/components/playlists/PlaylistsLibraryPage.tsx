"use client";

import { useState } from "react";
import { FavoriteAlbumsPage } from "@/components/discovery";
import { PlaylistsWorkspacePage } from "./PlaylistsWorkspacePage";
import { AlistPlaylistsView } from "./AlistPlaylistsView";
import { MusicIcon, RadioIcon, HeartIcon, FolderIcon } from "@/components/icons/DiscoverIcons";

type PlaylistLibraryTab = "local" | "network" | "favorites" | "alist";

const tabs: Array<{ id: PlaylistLibraryTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "local", label: "本地歌单", icon: MusicIcon },
  { id: "network", label: "网络歌单", icon: RadioIcon },
  { id: "favorites", label: "我的收藏", icon: HeartIcon },
  { id: "alist", label: "网盘目录", icon: FolderIcon }
];

export function PlaylistsLibraryPage() {
  const [activeTab, setActiveTab] = useState<PlaylistLibraryTab>("local");

  return (
    <main className="workspace-page hide-scrollbar relative overflow-y-auto selection:bg-accent/30 selection:text-white md:pl-60 lg:pb-28">
      <div aria-hidden="true" className="workspace-page-background" />
      <div className="workspace-page__inner relative z-10 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(var(--room-mobile-bottom-inset)+2.5rem)] sm:pt-6 md:pt-10 md:pb-28">
        {/* Segmented Control Navigation */}
        <header className="flex justify-center mb-6">
          <div
            aria-label="歌单分类"
            className="flex items-center gap-0.5 rounded-lg border border-surface-border p-0.5 bg-surface max-w-full overflow-x-auto hide-scrollbar touch-pan-x"
            role="tablist"
          >
            {tabs.map(({ id, label, icon: IconComp }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  aria-selected={isActive}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-surface-elevated text-foreground font-semibold shadow-xs border border-surface-border"
                      : "border border-transparent text-foreground-muted hover:text-foreground hover:bg-surface-hover/40"
                  }`}
                  onClick={() => setActiveTab(id)}
                  role="tab"
                  type="button"
                >
                  <IconComp className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-accent" : "text-foreground-muted"}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {activeTab === "local" ? <PlaylistsWorkspacePage embedded playlistView="local" /> : null}
        {activeTab === "network" ? <PlaylistsWorkspacePage embedded playlistView="network" /> : null}
        {activeTab === "favorites" ? <FavoriteAlbumsPage embedded fixedHeight={false} showTitle={false} /> : null}
        {activeTab === "alist" ? <AlistPlaylistsView /> : null}
      </div>
    </main>
  );
}
