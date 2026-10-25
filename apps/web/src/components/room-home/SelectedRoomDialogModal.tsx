"use client";

import React, { useState } from "react";
import type { RoomDirectoryItem } from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import { RoomDialog } from "./RoomDialog";
import { roomTypeDescription } from "./room-home-types";

export function SelectedRoomDialogModal({
  room,
  onClose,
  onConfirm,
  isPending,
  dialogError: initialDialogError
}: {
  room: RoomDirectoryItem;
  onClose: () => void;
  onConfirm: (password: string) => void;
  isPending: boolean;
  dialogError: string | null;
}) {
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || initialDialogError;

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (isPending) return;
    if (room.room.hasPassword && !password.trim()) {
      setLocalError("请输入房间密码。");
      return;
    }
    setLocalError(null);
    onConfirm(password.trim());
  };

  return (
    <RoomDialog
      description={
        room.room.description?.trim() || roomTypeDescription(room.room.roomType)
      }
      onClose={onClose}
      title={room.room.name ?? "未命名房间"}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-surface-border bg-background/50 p-3 text-sm">
          <div>
            <span className="block text-xs text-foreground-muted">房主</span>
            <span className="mt-1 block text-foreground">
              {room.room.directoryHostNickname || "未知"}
            </span>
          </div>
          <div>
            <span className="block text-xs text-foreground-muted">房间码</span>
            <span className="mt-1 block font-mono text-foreground">
              {room.room.joinCode}
            </span>
          </div>
          <div>
            <span className="block text-xs text-foreground-muted">状态</span>
            <span className="mt-1 block text-foreground">
              {room.room.visibility === "private" ? "私密" : "公开"}
            </span>
          </div>
          <div>
            <span className="block text-xs text-foreground-muted">在线成员</span>
            <span className="mt-1 block text-foreground">
              {room.room.directoryOnlineMemberCount} 人
            </span>
          </div>
        </div>
        {room.room.hasPassword ? (
          <label className="flex flex-col gap-2 text-sm text-foreground">
            房间密码
            <input
              autoCapitalize="none"
              autoCorrect="off"
              className="rounded-xl border border-surface-border bg-background px-3 py-2.5 text-sm text-foreground caret-accent outline-none placeholder:text-foreground-muted focus:border-accent focus:ring-1 focus:ring-accent"
              onChange={(event) => {
                setLocalError(null);
                setPassword(event.target.value);
              }}
              placeholder="请输入房间密码"
              spellCheck="false"
              type="password"
              value={password}
            />
          </label>
        ) : null}
        {displayedError ? (
          <p
            className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 animate-fade-in"
            role="alert"
          >
            {displayedError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button disabled={isPending} onClick={onClose} type="button" variant="ghost">
            暂不进入
          </Button>
          <Button data-testid="room-entry-confirm" disabled={isPending} type="submit">
            {isPending ? "进入中…" : "进入房间"}
          </Button>
        </div>
      </form>
    </RoomDialog>
  );
}
