import { useSyncExternalStore } from "react";
import type { SegmentedPlaybackSnapshot } from "@/features/playback/use-segmented-opus-playback";

export const initialSegmentedPlaybackSnapshot: SegmentedPlaybackSnapshot = {
  state: "idle",
  bufferedMs: 0,
  ownedUnitCount: 0,
  totalUnitCount: 0,
  audioContextState: null,
  lastError: null
};

type Listener = () => void;

class RoomMediaPlaybackStore {
  private current: SegmentedPlaybackSnapshot = initialSegmentedPlaybackSnapshot;
  private listeners = new Set<Listener>();

  getSnapshot = (): SegmentedPlaybackSnapshot => {
    return this.current;
  };

  setState = (next: SegmentedPlaybackSnapshot | ((current: SegmentedPlaybackSnapshot) => SegmentedPlaybackSnapshot)): void => {
    const resolved = typeof next === "function" ? next(this.current) : next;
    if (this.current === resolved) return;
    this.current = resolved;
    for (const listener of this.listeners) {
      listener();
    }
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  reset = (): void => {
    this.setState(initialSegmentedPlaybackSnapshot);
  };
}

export const roomMediaPlaybackStore = new RoomMediaPlaybackStore();

export function useRoomMediaPlayback<T = SegmentedPlaybackSnapshot>(
  selector: (snapshot: SegmentedPlaybackSnapshot) => T = (s) => s as unknown as T
): T {
  return useSyncExternalStore(
    roomMediaPlaybackStore.subscribe,
    () => selector(roomMediaPlaybackStore.getSnapshot()),
    () => selector(initialSegmentedPlaybackSnapshot)
  );
}
