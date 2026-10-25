"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 安卓应用内更新:通过原生 AppUpdater 插件用系统 DownloadManager 下载 APK,
 * 轮询进度,完成后自动拉起系统安装器。插件不存在(旧 APK/非安卓)时返回 false,
 * 由调用方回退到浏览器下载。
 */
export type InAppDownloadState =
  | { phase: "idle" }
  | { phase: "downloading"; progress: number }
  | { phase: "installing" }
  | { phase: "needs-permission"; message: string }
  | { phase: "failed"; message: string };

type AppUpdaterPlugin = {
  downloadApk(options: { url: string; versionName: string }): Promise<{ downloadId: number }>;
  getDownloadStatus(options: { downloadId: number }): Promise<{
    status: "running" | "paused" | "successful" | "failed";
    progress: number;
    reason?: string;
  }>;
  installApk(options: { downloadId: number }): Promise<void>;
};

function readPlugin(): AppUpdaterPlugin | null {
  if (typeof window === "undefined") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, AppUpdaterPlugin> } })
    .Capacitor?.Plugins;
  return plugins?.AppUpdater ?? null;
}

export function useInAppApkDownload(input: {
  url: string | null;
  versionName: string;
  enabled: boolean;
}) {
  const [state, setState] = useState<InAppDownloadState>({ phase: "idle" });
  const downloadIdRef = useRef<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  const poll = useCallback(
    (plugin: AppUpdaterPlugin, downloadId: number, attempt: number) => {
      if (!mountedRef.current) return;
      void plugin
        .getDownloadStatus({ downloadId })
        .then((status) => {
          if (!mountedRef.current) return;
          if (status.status === "successful") {
            setState({ phase: "installing" });
            void plugin
              .installApk({ downloadId })
              .then(() => {
                if (mountedRef.current) setState({ phase: "installing" });
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                const needsPermission = message.includes("安装未知应用");
                setState(
                  needsPermission
                    ? { phase: "needs-permission", message }
                    : { phase: "failed", message }
                );
              });
            return;
          }
          if (status.status === "failed") {
            setState({ phase: "failed", message: status.reason ?? "下载失败。" });
            return;
          }
          setState({ phase: "downloading", progress: status.progress });
          pollingRef.current = setTimeout(
            () => poll(plugin, downloadId, attempt + 1),
            attempt < 4 ? 400 : 800
          );
        })
        .catch(() => {
          if (!mountedRef.current) return;
          // 偶发查询失败:允许少量重试,超过后放弃并提示
          if (attempt < 6) {
            pollingRef.current = setTimeout(() => poll(plugin, downloadId, attempt + 1), 1000);
          } else {
            setState({ phase: "failed", message: "下载进度查询失败,请重试。" });
          }
        });
    },
    []
  );

  const start = useCallback(() => {
    if (!input.url) return;
    const plugin = readPlugin();
    if (!plugin) return;
    setState({ phase: "downloading", progress: 0 });
    void plugin
      .downloadApk({ url: input.url, versionName: input.versionName })
      .then((result) => {
        downloadIdRef.current = result.downloadId;
        poll(plugin, result.downloadId, 0);
      })
      .catch((error: unknown) => {
        setState({
          phase: "failed",
          message: error instanceof Error ? error.message : "下载启动失败。"
        });
      });
  }, [input.url, input.versionName, poll]);

  // 弹窗打开且插件可用时自动开始下载
  useEffect(() => {
    if (!input.enabled || !input.url) return;
    if (!readPlugin()) return;
    if (state.phase !== "idle") return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在弹窗打开时启动一次
  }, [input.enabled, input.url]);

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  const hasPlugin = typeof window !== "undefined" && readPlugin() !== null;
  return { state, start, reset, hasPlugin };
}
