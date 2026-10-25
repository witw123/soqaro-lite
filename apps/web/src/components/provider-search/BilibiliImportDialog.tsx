"use client";

import { useEffect, useRef, useState } from "react";
import type { BilibiliTrackCandidate } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useBackHandler } from "@/lib/desktop/use-back-handler";
import { soqaroApi } from "@/lib/network/soqaro-api";

type BilibiliImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImportSuccess: (tracks: BilibiliTrackCandidate[], title: string) => void;
  onAddToQueue?: (tracks: BilibiliTrackCandidate[]) => void;
};

export function BilibiliImportDialog({
  open,
  onClose,
  onImportSuccess,
  onAddToQueue
}: BilibiliImportDialogProps) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    title: string;
    items: BilibiliTrackCandidate[];
    total: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setPreviewResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useBackHandler(onClose, open && !loading);

  async function handleResolve() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setError("请输入 B 站收藏夹或合集链接");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await soqaroApi.importBilibiliFavorite({
        url: trimmed,
        page: 1,
        pageSize: 50
      });

      if (!res.items || res.items.length === 0) {
        setError("该收藏夹内没有找到可播放的音频或视频");
        setPreviewResult(null);
      } else {
        setPreviewResult({
          title: res.title || "B 站收藏夹",
          items: res.items,
          total: res.total
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析 B 站收藏夹失败，请检查链接或网络");
      setPreviewResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAsPlaylist() {
    if (!previewResult) return;
    onImportSuccess(previewResult.items, previewResult.title);
    onClose();
  }

  function handleQueueAll() {
    if (!previewResult) return;
    if (onAddToQueue) {
      onAddToQueue(previewResult.items);
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !loading && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b border-surface-border px-5 py-4">
          <DialogTitle className="text-base font-semibold text-foreground">
            导入 B 站收藏夹 / 合集
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label htmlFor="bili-fav-url" className="block text-foreground-muted mb-1.5 font-medium">
              收藏夹或播单链接 / ID
            </label>
            <div className="flex gap-2">
              <input
                id="bili-fav-url"
                ref={inputRef}
                type="text"
                value={urlInput}
                disabled={loading}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleResolve();
                  }
                }}
                placeholder="例如: https://www.bilibili.com/medialist/detail/ml... 或 ml123456"
                className="flex-1 rounded-md border border-surface-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-foreground-muted/60 focus:border-accent focus:outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={loading || !urlInput.trim()}
                onClick={() => void handleResolve()}
              >
                {loading ? "解析中..." : "解析"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              支持公开收藏夹链接（ml...）或纯 ID，免登录直接读取。
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-destructive text-xs">
              {error}
            </div>
          )}

          {previewResult && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-t border-surface-border pt-3">
                <span className="font-medium text-foreground truncate max-w-[280px]">
                  {previewResult.title}
                </span>
                <span className="text-foreground-muted text-xs">
                  共解析 {previewResult.items.length} 首歌曲
                </span>
              </div>

              {/* Preview items */}
              <div className="max-h-56 overflow-y-auto space-y-1 rounded-md border border-surface-border bg-background/50 p-2">
                {previewResult.items.map((track, idx) => (
                  <div
                    key={`${track.bvid}:${idx}`}
                    className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-surface-hover/50 text-xs"
                  >
                    <span className="truncate flex-1 text-foreground pr-2">
                      <span className="text-foreground-muted mr-1.5 font-mono">{idx + 1}.</span>
                      {track.title}
                    </span>
                    <span className="truncate text-foreground-muted max-w-[120px] text-right">
                      {track.artist}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-5 py-3 bg-surface/50">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>

          {previewResult && (
            <>
              {onAddToQueue && (
                <Button type="button" size="sm" variant="outline" onClick={handleQueueAll}>
                  添加到播放列表
                </Button>
              )}
              <Button type="button" size="sm" variant="default" onClick={handleSaveAsPlaylist}>
                保存为本地歌单
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
