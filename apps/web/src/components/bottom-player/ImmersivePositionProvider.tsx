"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const ImmersivePositionContext = createContext(0);

/**
 * 读取沉浸层自驱动播放位置。仅歌词/进度条等叶子组件消费;
 * 宿主布局不随之重渲染。
 */
export function useImmersivePositionMs() {
  return useContext(ImmersivePositionContext);
}

type ImmersivePositionProviderProps = {
  /** BottomPlayer 低频传入的权威锚点位置 */
  positionMs: number;
  isPlaying: boolean;
  durationMs: number;
  /** seek 拖动 / barrier 阻塞:冻结自推进,直接展示权威值 */
  frozen: boolean;
  active: boolean;
  children: ReactNode;
};

/**
 * 沉浸层自驱动进度 Provider:锚点由 BottomPlayer 低频重置,
 * 播放中以 50ms 自行推进,仅消费 context 的叶子组件重渲染。
 */
export function ImmersivePositionProvider({
  positionMs: anchorPositionMs,
  isPlaying,
  durationMs,
  frozen,
  active,
  children
}: ImmersivePositionProviderProps) {
  const [positionMs, setPositionMs] = useState(anchorPositionMs);
  const anchorRef = useRef({ ms: anchorPositionMs, atMs: Date.now(), playing: isPlaying });
  if (
    anchorRef.current.ms !== anchorPositionMs ||
    anchorRef.current.playing !== isPlaying
  ) {
    anchorRef.current = { ms: anchorPositionMs, atMs: Date.now(), playing: isPlaying };
  }

  useEffect(() => {
    if (!active || frozen || !isPlaying) {
      setPositionMs(anchorPositionMs);
      return;
    }
    const timer = window.setInterval(() => {
      setPositionMs(
        Math.min(
          durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY,
          anchorRef.current.ms + Math.max(0, Date.now() - anchorRef.current.atMs)
        )
      );
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, frozen, isPlaying, anchorPositionMs, durationMs]);

  return (
    <ImmersivePositionContext.Provider value={positionMs}>
      {children}
    </ImmersivePositionContext.Provider>
  );
}
