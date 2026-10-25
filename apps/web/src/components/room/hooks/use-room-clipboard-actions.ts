"use client";

import { useCallback } from "react";
import type { RoomSnapshot } from "@soqaro/shared";

type UseRoomClipboardActionsInput = {
  roomSnapshot: RoomSnapshot | null;
  setStatusMessage: (message: string) => void;
};

export function buildRoomShareUrl(origin: string, roomId: string) {
  return new URL(`/room/${encodeURIComponent(roomId)}`, origin).toString();
}

export function useRoomClipboardActions({
  roomSnapshot,
  setStatusMessage
}: UseRoomClipboardActionsInput) {
  const handleCopyJoinCode = useCallback(async () => {
    if (!roomSnapshot) {
      return;
    }

    try {
      await navigator.clipboard.writeText(roomSnapshot.room.joinCode);
      setStatusMessage(`已复制房间码 ${roomSnapshot.room.joinCode}。`);
    } catch {
      setStatusMessage("复制房间码失败，请手动复制。");
    }
  }, [roomSnapshot, setStatusMessage]);

  const handleShareRoom = useCallback(async () => {
    if (!roomSnapshot) {
      return;
    }

    try {
      const shareUrl = buildRoomShareUrl(window.location.origin, roomSnapshot.room.id);
      await navigator.clipboard.writeText(shareUrl);
      setStatusMessage("已复制房间链接，好友注册或登录后即可进入房间。");
    } catch {
      setStatusMessage("复制房间链接失败，请手动复制浏览器地址。");
    }
  }, [roomSnapshot, setStatusMessage]);

  return {
    handleCopyJoinCode,
    handleShareRoom
  };
}
