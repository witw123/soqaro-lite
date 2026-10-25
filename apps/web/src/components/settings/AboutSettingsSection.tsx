"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  getCurrentAppVersion,
  getClientPlatform,
  getClientRuntime,
  getPlatformDisplayName,
  openExternalUrl,
  resolveCurrentAppVersion
} from "@/features/update/update-checker";
import { useAppUpdate } from "@/features/update/use-app-update";

export function AboutSettingsSection() {
  // The build-time web version stands in until the desktop shell answers with
  // its own — see `resolveCurrentAppVersion`.
  const [currentVersion, setCurrentVersion] = useState(getCurrentAppVersion);
  const platform = getClientPlatform();
  const runtime = getClientRuntime();
  const platformName = getPlatformDisplayName(platform, runtime);

  const { status, result, errorMessage, check } = useAppUpdate();
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveCurrentAppVersion().then((version) => {
      if (!cancelled) setCurrentVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckUpdate = () => {
    void check(true);
  };

  const handleDownload = () => {
    if (result?.matchedAsset) {
      void openExternalUrl(result.matchedAsset.browser_download_url);
    } else if (result?.release) {
      void openExternalUrl(result.release.html_url);
    }
  };

  return (
    <section className="border-b border-surface-border pb-6">
      <h2 className="mb-3 text-base font-semibold text-foreground">关于</h2>
      <div className="divide-y divide-surface-border">
        {/* App Version & Update Check */}
        <div className="flex min-h-16 flex-col justify-between gap-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Soqaro</p>
              <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs font-mono text-foreground-muted">
                v{currentVersion}
              </span>
              <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-foreground-muted">
                {platformName}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-foreground-muted">
              基于 Next.js、Tauri 与 Capacitor 构建的分布式音乐协同播放空间。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {status === "latest" ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <CheckIcon />
                当前已是最新
              </span>
            ) : null}

            {status === "error" ? (
              <span className="text-xs text-rose-400" title={errorMessage ?? undefined}>
                检查失败
              </span>
            ) : null}

            <Button
              disabled={status === "checking"}
              onClick={handleCheckUpdate}
              size="sm"
              type="button"
              variant={status === "available" ? "default" : "outline"}
            >
              {status === "checking" ? (
                <>
                  <SpinnerIcon />
                  <span className="ml-1.5">检查中…</span>
                </>
              ) : status === "available" ? (
                "发现新版本"
              ) : (
                "检查更新"
              )}
            </Button>
          </div>
        </div>

        {/* Update Available Info */}
        {status === "available" && result ? (
          <div className="py-3">
            <div className="rounded-lg border border-surface-border bg-background/40 p-3">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-accent" />
                    <span className="text-sm font-medium text-foreground">
                      新版本 v{result.latestVersion} 已发布
                    </span>
                  </div>
                  {result.matchedAsset ? (
                    <p className="mt-1 text-xs text-foreground-muted font-mono">
                      {result.matchedAsset.name}
                      {result.matchedAsset.size > 0 && ` (${formatFileSize(result.matchedAsset.size)})`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-foreground-muted">
                      {runtime === "web"
                        ? "网页端已接入最新服务。若需在原生设备运行，可下载对应平台的客户端安装包。"
                        : "请前往 GitHub Release 获取适用于此设备的安装文件。"}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {result.release.body ? (
                    <Button
                      onClick={() => setShowChangelog((v) => !v)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {showChangelog ? "收起日志" : "更新日志"}
                    </Button>
                  ) : null}

                  <Button
                    onClick={handleDownload}
                    size="sm"
                    type="button"
                    variant="default"
                  >
                    <DownloadIcon />
                    <span className="ml-1.5">
                      {result.matchedAsset ? "下载安装包" : "查看发布"}
                    </span>
                  </Button>
                </div>
              </div>

              {showChangelog && result.release.body ? (
                <div className="mt-3 max-h-48 overflow-y-auto rounded border border-surface-border bg-surface p-2.5 text-xs text-foreground-muted">
                  <div className="whitespace-pre-wrap font-sans leading-5">
                    {result.release.body}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* GitHub & Open Source Links */}
        <div className="flex min-h-16 flex-col justify-between gap-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">开放源代码</p>
            <p className="mt-1 text-xs leading-5 text-foreground-muted">
              查看 GitHub 仓库主页、发布历史与各平台安装包。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => void openExternalUrl("https://github.com/witw123/soqaro-lite")}
              size="sm"
              type="button"
              variant="outline"
            >
              <ExternalLinkIcon />
              <span className="ml-1.5">GitHub 仓库</span>
            </Button>
            <Button
              onClick={() => void openExternalUrl("https://github.com/witw123/soqaro-lite/releases")}
              size="sm"
              type="button"
              variant="outline"
            >
              <ExternalLinkIcon />
              <span className="ml-1.5">Release 列表</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg fill="none" height="13" viewBox="0 0 24 24" width="13">
      <path
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
