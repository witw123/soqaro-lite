"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PersonalizationExclusion } from "@soqaro/shared";
import { useSessionIdentity } from "@/features/session/use-session-identity";
import { useWorkspacePageActive } from "@/features/workspace/page-activity";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { personalizationChangedEvent } from "@/features/personalization/use-personalization-reporter";
import { Button } from "@/components/ui/button";
import {
  ShieldCheckIcon,
  RotateCcwIcon,
  SlidersIcon,
  MusicIcon,
  LandmarkIcon
} from "@/components/icons/DiscoverIcons";

export function TasteExclusionsManager({
  onOpenColdStart
}: {
  onOpenColdStart: () => void;
}) {
  const pageActive = useWorkspacePageActive();
  const { activeSession } = useSessionIdentity({
    sessionStorageKey: "soqaro-session",
    initialStatusMessage: ""
  });
  const queryClient = useQueryClient();
  const queryKey = ["personalization", activeSession?.userId ?? null, "exclusions"];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => soqaroApi.listPersonalizationExclusions(signal),
    enabled: pageActive && Boolean(activeSession)
  });
  const exclusions = query.data ?? [];
  const loading = query.isLoading;
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pageActive) {
      void queryClient.cancelQueries({
        queryKey: ["personalization", activeSession?.userId ?? null, "exclusions"],
        type: "inactive"
      });
    }
  }, [pageActive, activeSession?.userId, queryClient]);

  const handleRestore = async (kind: "track" | "artist", key: string) => {
    const itemKey = `${kind}:${key}`;
    setRemovingKey(itemKey);
    setErrorMessage(null);
    try {
      await soqaroApi.removePersonalizationExclusion(kind, key);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<PersonalizationExclusion[]>(queryKey,
        (prev) => prev?.filter((item) => !(item.kind === kind && item.key === key)));
      window.dispatchEvent(new Event(personalizationChangedEvent));
    } catch {
      setErrorMessage("恢复失败，请稍后重试。");
    } finally {
      setRemovingKey(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Cold Start / Taste Tuning Banner */}
      <section className="rounded-xl border border-surface-border bg-surface/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <SlidersIcon className="w-3.5 h-3.5" />
              <span>偏好定制</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
              重新调整你的音乐偏好
            </h3>
            <p className="text-xs text-foreground-muted max-w-xl leading-relaxed">
              挑选常听的曲风与使用场景，让推荐内容和自动续播电台更贴合你的听歌习惯。
            </p>
          </div>
          <Button
            type="button"
            onClick={onOpenColdStart}
            className="rounded-xl px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium shadow-xs transition-all shrink-0"
          >
            <SlidersIcon className="w-3.5 h-3.5 mr-1.5" />
            调整偏好
          </Button>
        </div>
      </section>

      {/* Exclusions List */}
      <section className="rounded-xl border border-surface-border bg-surface/40 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface border border-surface-border text-foreground">
              <ShieldCheckIcon className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">屏蔽与负反馈</h3>
              <p className="text-xs text-foreground-muted">已从推荐与偏好统计中排除的歌曲或歌手</p>
            </div>
          </div>
          <span className="text-xs tabular-nums text-foreground-muted bg-surface/60 border border-surface-border px-2 py-0.5 rounded-full">
            共 {exclusions.length} 项
          </span>
        </div>

        {(errorMessage || query.error) && (
          <p className="mb-4 text-xs text-red-400 bg-red-950/30 px-3 py-2 rounded-lg">
            {errorMessage ?? "加载屏蔽记录失败，请稍后重试。"}
          </p>
        )}

        {loading ? (
          <div className="space-y-2 py-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface/35 animate-pulse" />
            ))}
          </div>
        ) : exclusions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl bg-surface/20 border border-surface-border/40">
            <ShieldCheckIcon className="w-7 h-7 text-foreground-muted mb-2" />
            <p className="text-xs sm:text-sm font-medium text-foreground">暂无屏蔽项目</p>
            <p className="text-xs text-foreground-muted mt-1 max-w-sm">
              在歌曲或搜索结果中选择「不再推荐」后，可以在这里随时恢复。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {exclusions.map((item) => {
              const itemKey = `${item.kind}:${item.key}`;
              const isRemoving = removingKey === itemKey;
              return (
                <div
                  key={itemKey}
                  className="flex items-center justify-between gap-2 sm:gap-3 py-2 px-2.5 sm:px-3 rounded-xl transition-colors hover:bg-white/[0.04] min-w-0 overflow-hidden"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 min-w-[1.75rem] min-h-[1.75rem] max-w-[2rem] max-h-[2rem] shrink-0 rounded-lg bg-surface-elevated text-foreground-muted">
                      {item.kind === "artist" ? (
                        <LandmarkIcon className="w-3.5 h-3.5" />
                      ) : (
                        <MusicIcon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                        <span className="truncate text-xs sm:text-sm font-semibold text-foreground" title={item.label || item.key}>
                          {item.label || item.key}
                        </span>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                            item.action === "not-interested"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-surface-elevated text-foreground-muted"
                          }`}
                        >
                          {item.action === "not-interested" ? "不再推荐" : "不计入画像"}
                        </span>
                      </div>
                      <p className="text-xs text-foreground-muted mt-0.5 truncate">
                        {item.kind === "artist" ? "艺人" : "单曲"} / 屏蔽于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isRemoving}
                    onClick={() => handleRestore(item.kind, item.key)}
                    className="shrink-0 h-7 sm:h-8 px-2.5 rounded-lg text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-white/[0.06] whitespace-nowrap"
                  >
                    <RotateCcwIcon className="w-3 h-3 mr-1" />
                    <span>{isRemoving ? "恢复中..." : "恢复推荐"}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
