"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { TrackMeta } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { useBackHandler } from "@/lib/desktop/use-back-handler";
import { checkAnyProviderAccountBound } from "@/features/playback/provider-account-guard";
import { updateAppSettings } from "@/features/settings/settings-store";
import { resolveProviderTrackSource } from "@/features/library/provider-track-identity";

type CachePlaybackPromptModalProps = {
  isOpen: boolean;
  track: TrackMeta | null;
  isSourceOwner?: boolean;
  onClose: () => void;
  onEnabled?: () => void;
};

export function CachePlaybackPromptModal({
  isOpen,
  track,
  isSourceOwner = false,
  onClose,
  onEnabled
}: CachePlaybackPromptModalProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [requiresBinding, setRequiresBinding] = useState(false);

  useBackHandler(onClose, isOpen);

  if (!isOpen || !track) return null;

  const providerSource = resolveProviderTrackSource(track);
  const platformName = providerSource?.provider === "qqmusic" ? "QQ 音乐" : "网易云音乐";

  const handleEnableCache = async () => {
    setChecking(true);
    try {
      const status = await checkAnyProviderAccountBound();
      if (!status.bound) {
        setRequiresBinding(true);
        setChecking(false);
        return;
      }

      updateAppSettings({ playback: { fullyCachedPlayback: true } });
      onEnabled?.();
      onClose();
    } catch {
      setRequiresBinding(true);
    } finally {
      setChecking(false);
    }
  };

  const handleGoToBind = () => {
    onClose();
    router.push("/app/settings" as Route);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader className="pr-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface text-accent">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m8 17 4 4 4-4" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold text-foreground tracking-tight">
                {requiresBinding ? "需要绑定平台账号" : isSourceOwner ? "歌曲源 OPS 资产缺失提示" : "开启缓存播放提示"}
              </DialogTitle>
              <DialogDescription className="text-xs text-foreground-muted truncate">
                {track.title} {track.artist ? `- ${track.artist}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="text-xs">
          {requiresBinding ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-200/90 leading-relaxed">
              <p className="font-medium text-amber-100">
                ⚠️ 开启缓存播放必须先绑定网易云音乐或 QQ 音乐账号。
              </p>
              <p>
                {isSourceOwner
                  ? `您是当前歌曲的播放源，歌曲来自 ${platformName}。绑定账号并开启缓存播放后，方可向房间内其他成员广播音频。`
                  : `当前歌曲来自 ${platformName}，绑定对应账号后即可从音乐平台自动拉取高质量音频并在本地高速缓存播放。`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-surface/50 p-4 leading-relaxed">
              <p className="text-foreground">
                {isSourceOwner ? (
                  <>
                    您正在播放的歌曲 <span className="font-semibold">《{track.title}》</span> 未在房间曲库中预置 OPS 音频资产。
                  </>
                ) : (
                  <>
                    当前播放的歌曲 <span className="font-semibold">《{track.title}》</span> 未在房间曲库中预置 OPS 音频资产。
                  </>
                )}
              </p>
              <p className="text-foreground-muted">
                {isSourceOwner
                  ? `开启「缓存播放」后，将自动通过绑定的 ${platformName} 账号获取完整音频并向全房广播；若不开启，其他成员将无法听到该歌曲。`
                  : `开启「缓存播放」后，将自动通过您绑定的 ${platformName} 账号获取完整歌曲音频并在本地缓存播放，享受最高音质体验。`}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            {requiresBinding ? "稍后再说" : "暂不开启"}
          </Button>
          {requiresBinding ? (
            <Button
              onClick={handleGoToBind}
              size="sm"
              type="button"
            >
              前往设置绑定账号
            </Button>
          ) : (
            <Button
              disabled={checking}
              onClick={handleEnableCache}
              size="sm"
              type="button"
            >
              {checking ? "正在检查账号..." : "开启缓存播放"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
