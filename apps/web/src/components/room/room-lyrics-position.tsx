"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode
} from "react";
import type { PlaybackSnapshot } from "@soqaro/shared";
import { getPlaybackEffectivePositionMs } from "@/features/playback/use-room-playback";
import type { RoomPlaybackBarrierClock } from "@/features/playback/room-playback-clock";

const RoomLyricsPositionContext = createContext(0);

/**
 * 读取歌词/进度展示用的实时播放位置。该值以 10Hz 更新,
 * 只有调用本 hook 的叶子组件会随之重渲染,宿主布局不受影响。
 */
export function useRoomLyricsPositionMs() {
  return useContext(RoomLyricsPositionContext);
}

type RoomLyricsPositionProviderProps = {
  playback: PlaybackSnapshot;
  currentPlaybackPositionRef?: MutableRefObject<number>;
  currentTrackDuration: number;
  isPlaying: boolean;
  playbackBarrier?: RoomPlaybackBarrierClock | null;
  playbackPositionKey: string;
  playbackBarrierKey: string;
  children: ReactNode;
};

/**
 * 把高频(100ms)的播放位置状态从舞台布局中隔离出来:
 * Provider 自身以 10Hz 重渲染,但 children 是稳定的 ReactNode,
 * React 会跳过它们的协调,只有消费 context 的歌词/进度叶子组件更新。
 */
export function RoomLyricsPositionProvider({
  playback,
  currentPlaybackPositionRef,
  currentTrackDuration,
  isPlaying,
  playbackBarrier,
  playbackPositionKey,
  playbackBarrierKey,
  children
}: RoomLyricsPositionProviderProps) {
  const [positionMs, setPositionMs] = useState(playback.positionMs);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const playbackBarrierRef = useRef(playbackBarrier);
  playbackBarrierRef.current = playbackBarrier;

  useEffect(() => {
    const updatePosition = () => {
      const livePosition = currentPlaybackPositionRef?.current;
      if (typeof livePosition === "number" && livePosition > 0) {
        setPositionMs(livePosition);
        return;
      }
      setPositionMs(
        getPlaybackEffectivePositionMs(
          playbackRef.current,
          currentTrackDuration,
          undefined,
          playbackBarrierRef.current
        )
      );
    };

    updatePosition();
    if (!isPlaying || playbackRef.current.status !== "playing") return;

    const timer = window.setInterval(updatePosition, 100);
    return () => window.clearInterval(timer);
  }, [
    currentPlaybackPositionRef,
    currentTrackDuration,
    isPlaying,
    playbackPositionKey,
    playbackBarrierKey
  ]);

  return (
    <RoomLyricsPositionContext.Provider value={positionMs}>
      {children}
    </RoomLyricsPositionContext.Provider>
  );
}
