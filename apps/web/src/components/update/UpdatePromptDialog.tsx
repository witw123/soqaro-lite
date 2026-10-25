"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { useBackHandler } from "@/lib/desktop/use-back-handler";
import {
  formatFileSize,
  getPlatformDisplayName,
  openExternalUrl,
  type UpdateCheckResult
} from "@/features/update/update-checker";
import { useInAppApkDownload } from "@/features/update/use-in-app-apk-download";
import { useDesktopUpdater } from "@/features/update/use-desktop-updater";

interface UpdatePromptDialogProps {
  open: boolean;
  result: UpdateCheckResult | null;
  onDismiss: () => void;
}

export function UpdatePromptDialog({
  open,
  result,
  onDismiss
}: UpdatePromptDialogProps) {
  useBackHandler(onDismiss, open);

  // hooks 必须在任何提前 return 之前调用
  const downloadTarget = result?.matchedAsset ?? null;
  const isAndroidNative =
    result?.runtime === "mobile-native" && result?.platform === "android";
  const isDesktopNative = result?.runtime === "desktop";
  const inAppDownload = useInAppApkDownload({
    url: downloadTarget?.browser_download_url ?? null,
    versionName: result?.latestVersion ?? "",
    enabled: open && isAndroidNative && downloadTarget !== null
  });
  const desktopUpdater = useDesktopUpdater(open && isDesktopNative, () => {
    const url = downloadTarget?.browser_download_url ?? result?.release.html_url;
    if (url) void openExternalUrl(url);
  });

  if (!open || !result || !result.hasUpdate) return null;

  const platformName = getPlatformDisplayName(result.platform, result.runtime);
  const isDesktopDownloading =
    desktopUpdater.state.phase === "checking" ||
    desktopUpdater.state.phase === "downloading" ||
    desktopUpdater.state.phase === "installing";

  const handleDownload = () => {
    if (isDesktopNative) {
      void desktopUpdater.start();
      return;
    }
    if (isAndroidNative && inAppDownload.hasPlugin) {
      // 应用内下载已自动开始;此处仅兜底重试
      inAppDownload.start();
      return;
    }
    if (downloadTarget) {
      void openExternalUrl(downloadTarget.browser_download_url);
    } else {
      void openExternalUrl(result.release.html_url);
    }
    onDismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="max-w-md p-5 sm:p-6">
        <DialogHeader className="pr-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-accent" />
              <DialogTitle className="text-base font-semibold text-foreground">
                发现新版本 v{result.latestVersion}
              </DialogTitle>
            </div>
            <span className="rounded bg-surface-hover px-2 py-0.5 text-xs text-foreground-muted">
              {platformName}
            </span>
          </div>
          <DialogDescription className="mt-2 text-xs leading-5 text-foreground-muted">
            当前运行版本为 v{result.currentVersion}。检测到 GitHub 远端有新版本发布。
          </DialogDescription>
        </DialogHeader>

        {downloadTarget ? (
          <div className="rounded border border-surface-border bg-background/50 p-2.5 text-xs">
            <div className="font-mono text-foreground">{downloadTarget.name}</div>
            {downloadTarget.size > 0 ? (
              <div className="mt-1 text-foreground-muted">
                安装包大小: {formatFileSize(downloadTarget.size)}
              </div>
            ) : null}
            {isDesktopNative && desktopUpdater.state.phase !== "idle" ? (
              <div className="mt-2" data-testid="desktop-updater-progress">
                {desktopUpdater.state.phase === "checking" ? (
                  <div className="text-foreground-muted">正在检查更新…</div>
                ) : null}
                {desktopUpdater.state.phase === "downloading" ? (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/40">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${Math.max(4, desktopUpdater.state.progress)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-foreground-muted">
                      正在下载更新… {desktopUpdater.state.progress}%
                    </div>
                  </>
                ) : null}
                {desktopUpdater.state.phase === "installing" ? (
                  <div className="text-foreground-muted">下载完成,正在静默安装…</div>
                ) : null}
                {desktopUpdater.state.phase === "done" ? (
                  <div className="text-emerald-400">安装完成,应用即将重启。</div>
                ) : null}
                {desktopUpdater.state.phase === "failed" ? (
                  <div className="text-red-400">{desktopUpdater.state.message}</div>
                ) : null}
              </div>
            ) : null}
            {isAndroidNative && inAppDownload.state.phase !== "idle" ? (
              <div className="mt-2" data-testid="in-app-download-progress">
                {inAppDownload.state.phase === "downloading" ? (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/40">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${Math.max(4, inAppDownload.state.progress)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-foreground-muted">
                      正在下载更新包… {inAppDownload.state.progress}%
                    </div>
                  </>
                ) : null}
                {inAppDownload.state.phase === "installing" ? (
                  <div className="text-foreground-muted">下载完成,正在打开安装器…</div>
                ) : null}
                {inAppDownload.state.phase === "needs-permission" ? (
                  <div className="text-amber-400">{inAppDownload.state.message} 授权后点击下方按钮重试。</div>
                ) : null}
                {inAppDownload.state.phase === "failed" ? (
                  <div className="text-red-400">{inAppDownload.state.message}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {result.release.body ? (
          <div className="max-h-40 overflow-y-auto rounded border border-surface-border bg-background/30 p-2.5 text-xs text-foreground-muted">
            <div className="mb-1 font-medium text-foreground">更新日志:</div>
            <div className="whitespace-pre-wrap font-sans text-xs leading-5 opacity-90">
              {result.release.body}
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
            稍后提醒
          </Button>
          <Button
            onClick={handleDownload}
            size="sm"
            type="button"
            variant="default"
            disabled={
              (isAndroidNative &&
                (inAppDownload.state.phase === "downloading" ||
                  inAppDownload.state.phase === "installing")) ||
              (isDesktopNative && isDesktopDownloading)
            }>
            {isDesktopNative
              ? desktopUpdater.state.phase === "checking"
                ? "检查中…"
                : desktopUpdater.state.phase === "downloading"
                  ? `下载中 ${desktopUpdater.state.progress}%`
                  : desktopUpdater.state.phase === "installing"
                    ? "安装中…"
                    : desktopUpdater.state.phase === "failed"
                      ? "重试"
                      : "下载并安装"
              : isAndroidNative && inAppDownload.hasPlugin
                ? inAppDownload.state.phase === "downloading"
                  ? `下载中 ${inAppDownload.state.progress}%`
                  : inAppDownload.state.phase === "installing"
                    ? "打开安装器…"
                    : inAppDownload.state.phase === "needs-permission" || inAppDownload.state.phase === "failed"
                      ? "重试"
                      : "下载并安装"
                : downloadTarget
                  ? "立即下载"
                  : "前往下载"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
