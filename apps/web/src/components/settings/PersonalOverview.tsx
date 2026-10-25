"use client";

import Link from "next/link";
import type { AuthSession } from "@soqaro/shared";
import { useLocalPlayer } from "@/features/playback/local-player-context";
import { usePersonalizationProfile } from "@/features/personalization/use-personalization-profile";
import { SettingsIcon } from "@/components/icons/DiscoverIcons";
import { LogOut } from "lucide-react";

export function PersonalOverview({
  activeSession,
  onLogout
}: {
  activeSession: AuthSession;
  onLogout?: () => void;
}) {
  const player = useLocalPlayer();
  const { profile } = usePersonalizationProfile();

  const tasteLabels: string[] = [];
  if (profile) {
    for (const group of profile.tasteGroups) {
      for (const tag of group.tags) {
        if (tag.label && !tasteLabels.includes(tag.label)) {
          tasteLabels.push(tag.label);
        }
        if (tasteLabels.length >= 3) break;
      }
      if (tasteLabels.length >= 3) break;
    }
  }

  const nowPlaying = player.playback?.status === "playing" ? player.currentTrack : null;

  return (
    <section aria-labelledby="personal-overview-title" className="mb-3.5 sm:mb-5">
      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface/40 p-3.5 sm:p-4 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Clean Avatar with online indicator */}
          <div className="relative shrink-0 flex items-center justify-center">
            <div
              aria-hidden="true"
              className="relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-base sm:text-lg font-semibold text-foreground border border-surface-border shadow-sm"
            >
              {getInitials(activeSession.nickname)}
              <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>
          </div>

          {/* User Identity: name, taste summary, listening totals */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1
              className="truncate text-base sm:text-lg font-semibold text-foreground tracking-tight"
              id="personal-overview-title"
              title={activeSession.nickname}
            >
              {activeSession.nickname}
            </h1>
            {tasteLabels.length > 0 ? (
              <p className="mt-0.5 truncate text-xs text-foreground-muted">
                常听 <span className="text-foreground">{tasteLabels.join("、")}</span>
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted tabular-nums">
              <span className="font-mono text-xs truncate max-w-[130px] sm:max-w-none" title={`@${activeSession.username}`}>
                @{activeSession.username}
              </span>
              {profile ? (
                <>
                  <span className="text-surface-border">/</span>
                  <span title="累计收听时长与探索曲目">{formatListeningSummary(profile.totalListenedMs, profile.trackCount)}</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Settings & logout on the right */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              aria-label="打开设置"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-all cursor-pointer"
              data-testid="profile-settings-button"
              href="/app/settings"
              title="设置"
            >
              <SettingsIcon className="w-4 h-4" />
            </Link>
            {onLogout ? (
              <button
                aria-label="退出登录"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-muted hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95 cursor-pointer"
                data-testid="profile-logout-button"
                onClick={onLogout}
                title="退出登录"
                type="button"
              >
                <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                <span>退出</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Now Playing signal: playback stays the center of gravity, even here */}
        {nowPlaying ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 min-w-0">
            <span aria-hidden="true" className="flex items-end gap-0.5 h-3 shrink-0 text-accent">
              <span className="w-0.5 h-full bg-current rounded-full animate-music-bar origin-bottom" style={{ animationDuration: "0.9s" }} />
              <span className="w-0.5 h-full bg-current rounded-full animate-music-bar origin-bottom" style={{ animationDuration: "1.1s", animationDelay: "0.2s" }} />
              <span className="w-0.5 h-full bg-current rounded-full animate-music-bar origin-bottom" style={{ animationDuration: "0.8s", animationDelay: "0.4s" }} />
            </span>
            <p className="min-w-0 flex-1 truncate text-xs">
              <span className="font-semibold text-accent">正在听</span>
              <span className="text-surface-border"> / </span>
              <span className="font-medium text-foreground">{nowPlaying.title}</span>
              {nowPlaying.artist ? <span className="text-foreground-muted"> / {nowPlaying.artist}</span> : null}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getInitials(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "M";
  }
  const characters = Array.from(normalized);
  return characters.length > 1 ? `${characters[0]}${characters[characters.length - 1]}` : characters[0];
}

function formatListeningSummary(totalListenedMs: number, trackCount: number) {
  const totalMinutes = Math.max(0, Math.floor(totalListenedMs / 60_000));
  const duration = totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)} 小时${totalMinutes % 60 > 0 ? ` ${totalMinutes % 60} 分` : ""}`
    : `${totalMinutes} 分钟`;
  return `${duration} / ${trackCount} 首`;
}
