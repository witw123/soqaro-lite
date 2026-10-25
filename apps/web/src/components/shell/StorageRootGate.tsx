"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { FolderIcon } from "@/components/icons/DiscoverIcons";
import {
  chooseLocalAudioDirectory,
  initializeLocalStorage,
  requestLocalAudioDirectoryPermission,
  supportsLocalAudioDirectory
} from "@/features/library/local-audio-storage";
import { hasNativeStorage } from "@/features/library/native-storage";
import { storageRootChangingEvent, storageRootChangedEvent } from "@/features/library/storage-root-events";
import { useActiveSession } from "@/features/session/use-session-identity";

export function StorageRootGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeSession = useActiveSession();
  // Only the signed-in app needs a storage root. An anonymous visitor browses
  // the room directory without answering a directory prompt first; the gate
  // comes up when the session arrives and drops away again on sign-out.
  const required = Boolean(activeSession) && /^\/(app|rooms|room)(\/|$)/.test(pathname ?? "");
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReady(await initializeLocalStorage());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法打开存储根目录。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (required && !ready && !switching) void check();
  }, [required, ready, switching, check]);

  useEffect(() => {
    // Release playback and page tasks before replacing their repository index.
    const changing = () => flushSync(() => {
      setSwitching(true);
      setReady(false);
      setBusy(true);
    });
    const changed = () => setSwitching(false);
    window.addEventListener(storageRootChangingEvent, changing);
    window.addEventListener(storageRootChangedEvent, changed);
    return () => {
      window.removeEventListener(storageRootChangingEvent, changing);
      window.removeEventListener(storageRootChangedEvent, changed);
    };
  }, []);

  if (!required || ready) return children;
  const native = hasNativeStorage();
  const authorize = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await requestLocalAudioDirectoryPermission())) await chooseLocalAudioDirectory();
      await check();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "无法设置存储根目录。");
      }
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Soqaro</h1>
      <p className="text-sm text-foreground-muted" role="status">
        {busy ? "正在打开存储根目录…" : native ? "无法打开应用存储目录" : "尚未授权存储根目录"}
      </p>
      {error ? <p className="break-words text-sm text-red-400" role="alert">{error}</p> : null}
      {!busy && native ? (
        <Button className="w-fit" variant="outline" size="sm" onClick={() => void check()}>重试</Button>
      ) : null}
      {!busy && !native && supportsLocalAudioDirectory() ? (
        <Button className="w-fit gap-2" variant="outline" size="sm" onClick={() => void authorize()}>
          <FolderIcon />选择或授权根目录
        </Button>
      ) : null}
      {!busy && !native && !supportsLocalAudioDirectory() ? (
        <p className="text-sm text-amber-300">当前浏览器不支持目录授权，请使用桌面版 Chrome、Edge 或 Soqaro 客户端。</p>
      ) : null}
    </main>
  );
}
