"use client";

/**
 * 房间 tab 面板 chunk 未就绪时的等高占位:
 * 避免切换瞬间内容区塌缩成空白造成的整页闪动。
 */
export function RoomTabPanelPlaceholder() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center" aria-hidden="true">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-foreground-muted" />
    </div>
  );
}

/**
 * 房间 tab 面板迟早都会被点到:空闲时预取各面板 chunk,
 * 让首次切换无需出现加载占位。
 */
export function preloadRoomPanelChunks(importers: Array<() => Promise<unknown>>) {
  const preload = () => {
    for (const load of importers) void load();
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(preload, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(preload, 1200);
  return () => window.clearTimeout(timer);
}
