"use client";

import { useRef } from "react";
import type { RoomSnapshot } from "@soqaro/shared";
import type { RoomSocket } from "@/lib/network/ws-client";
import type { P2PMesh } from "@/features/p2p";
import type { useSessionIdentity } from "@/features/session/use-session-identity";

type UseRoomAppRefsInput = {
  roomPlayback: RoomSnapshot["room"]["playback"] | null;
};

export function useRoomAppRefs({ roomPlayback }: UseRoomAppRefsInput) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<RoomSocket | null>(null);
  const meshRef = useRef<P2PMesh | null>(null);
  const currentPlaybackPositionRef = useRef(0);
  const activeSessionRef = useRef<ReturnType<typeof useSessionIdentity>["activeSession"]>(null);
  const currentRoomRef = useRef<RoomSnapshot | null>(null);
  const uploadedTrackIdsRef = useRef<string[]>([]);
  const roomPlaybackRef = useRef(roomPlayback);
  roomPlaybackRef.current = roomPlayback;

  return {
    activeSessionRef,
    audioRef,
    currentPlaybackPositionRef,
    currentRoomRef,
    meshRef,
    roomPlaybackRef,
    socketRef,
    uploadedTrackIdsRef
  };
}
