"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 桌面端应用内更新:走 Tauri updater 插件(读取 Release 的 latest.json,
 * 校验签名后下载并静默安装,完成后重启应用)。
 * 直接经由全局 __TAURI_INTERNALS__ 调用插件命令(与仓库其他桌面交互一致,
 * 不引入 @tauri-apps/api 依赖);进度通过 Channel 标记对象回传。
 */
export type DesktopUpdaterState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; progress: number }
  | { phase: "installing" }
  | { phase: "done" }
  | { phase: "failed"; message: string };

type UpdaterDownloadEvent = {
  event: string;
  data?: { chunkLength?: number; contentLength?: number };
};

type TauriInternals = {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback?: (callback: (response: unknown) => void, once?: boolean) => number;
  core?: {
    invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    transformCallback?: (callback: (response: unknown) => void, once?: boolean) => number;
  };
};

type UpdateResource = {
  rid?: number;
  available?: boolean;
  currentVersion?: string;
  version?: string;
  body?: string;
};

function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  const invoke = internals?.invoke ?? internals?.core?.invoke;
  if (!invoke) {
    return Promise.reject(new Error("Tauri invoke 不可用。"));
  }
  return invoke(command, args) as Promise<T>;
}

/** 复刻 @tauri-apps/api Channel 的序列化约定(__CHANNEL__:<id>),供插件回传进度。 */
function createProgressChannel(onMessage: (message: UpdaterDownloadEvent) => void) {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  const transformCallback = internals?.core?.transformCallback ?? internals?.transformCallback;
  if (!transformCallback) return undefined;
  const id = transformCallback((response: unknown) => {
    onMessage(response as UpdaterDownloadEvent);
  });
  return { toJSON: () => `__CHANNEL__:${id}` };
}

export function useDesktopUpdater(
  enabled: boolean,
  onFailFallback?: () => void
) {
  const [state, setState] = useState<DesktopUpdaterState>({ phase: "idle" });
  const busyRef = useRef(false);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setState({ phase: "checking" });
      const update = await tauriInvoke<UpdateResource>("plugin:updater|check");
      if (!update || update.available === false) {
        setState({ phase: "done" });
        return;
      }
      const rid = update.rid;
      if (typeof rid !== "number") {
        setState({ phase: "failed", message: "更新资源无效,请到 Release 页手动下载。" });
        return;
      }

      setState({ phase: "downloading", progress: 0 });
      let contentLength = 0;
      let received = 0;
      const onEvent = createProgressChannel((message) => {
        if (message.event === "Started") {
          contentLength = message.data?.contentLength ?? 0;
        } else if (message.event === "Progress") {
          received += message.data?.chunkLength ?? 0;
          const progress =
            contentLength > 0 ? Math.min(99, Math.round((received * 100) / contentLength)) : 0;
          setState((current) =>
            current.phase === "downloading" ? { phase: "downloading", progress } : current
          );
        }
      });
      if (!onEvent) {
        setState({ phase: "failed", message: "进度通道不可用,请到 Release 页手动下载。" });
        return;
      }
      await tauriInvoke("plugin:updater|download", { onEvent, rid });

      setState({ phase: "installing" });
      await tauriInvoke("plugin:updater|install", { rid });
      // Windows 安装器会接管并退出应用;macOS 安装完成后应用自动替换。
      setState({ phase: "done" });
      try {
        await tauriInvoke("plugin:process|restart");
      } catch {
        // 重启失败时保留完成态,用户手动重开即可
      }
    } catch (error) {
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : "自动更新失败,请到 Release 页手动下载。"
      });
      // 旧壳没有编译 updater 插件时,check 会失败:自动回退浏览器下载,
      // 保证用户总能拿到新版本(装上 v0.3.5+ 后后续更新走自动通道)。
      onFailFallback?.();
    } finally {
      busyRef.current = false;
    }
  }, [onFailFallback]);

  useEffect(() => {
    if (enabled) return;
    setState({ phase: "idle" });
    busyRef.current = false;
  }, [enabled]);

  return { state, start };
}
