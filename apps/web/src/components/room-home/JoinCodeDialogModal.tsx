"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomDialog } from "./RoomDialog";

export function JoinCodeDialogModal({
  onClose,
  onSubmit,
  isPending,
  statusMessage
}: {
  onClose: () => void;
  onSubmit: (code: string) => void;
  isPending: boolean;
  statusMessage: string;
}) {
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || statusMessage;

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (isPending) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setLocalError("请输入 6 位房间码。");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  return (
    <RoomDialog
      description="输入 6 位房间码，加入公开或私密房间。"
      onClose={onClose}
      title="输入房间码加入"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm text-foreground" htmlFor="join-code-input">
          房间码
          <input
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-full rounded-xl border border-surface-border bg-background px-3 py-2.5 font-mono uppercase text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            data-testid="join-code-input"
            id="join-code-input"
            onChange={(event) => {
              setLocalError(null);
              setCode(event.target.value.toUpperCase());
            }}
            placeholder="输入 6 位房间码"
            spellCheck="false"
            value={code}
          />
        </label>
        {displayedError ? (
          <p
            className="animate-fade-in rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
            data-testid="room-home-status"
            role="alert"
          >
            {displayedError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} type="button" variant="ghost">
            取消
          </Button>
          <Button data-testid="join-code-submit" disabled={isPending} type="submit">
            {isPending ? "进入中…" : "进入房间"}
          </Button>
        </div>
      </form>
    </RoomDialog>
  );
}
