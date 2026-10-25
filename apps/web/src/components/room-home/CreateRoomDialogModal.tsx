"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MemberPermissionControls } from "@/components/room/MembersPanel";
import { RoomDialog } from "./RoomDialog";
import {
  type CreateRoomForm,
  emptyCreateRoomForm,
  roomTypeDescription,
  roomTypeLabel
} from "./room-home-types";

export function CreateRoomDialogModal({
  initialVisibility,
  onClose,
  onSubmit,
  isPending,
  dialogError: initialDialogError,
  defaultRoomName
}: {
  initialVisibility: "public" | "private";
  onClose: () => void;
  onSubmit: (form: CreateRoomForm) => void;
  isPending: boolean;
  dialogError: string | null;
  defaultRoomName?: string;
}) {
  const [form, setForm] = useState<CreateRoomForm>(() => ({
    ...emptyCreateRoomForm,
    visibility: initialVisibility
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const displayedError = localError || initialDialogError;

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (isPending) return;

    const trimmedPassword = form.password.trim();
    if (trimmedPassword.length > 0 && trimmedPassword.length < 4) {
      setLocalError("房间密码至少需要 4 位字符。");
      return;
    }

    setLocalError(null);
    const finalName = form.name.trim() || defaultRoomName || "音乐房间";
    onSubmit({
      ...form,
      name: finalName,
      password: trimmedPassword
    });
  };

  return (
    <RoomDialog
      description="设置房间信息后再进入协作空间。名称留空将使用默认名称，简介和密码可以留空。"
      onClose={onClose}
      title="创建房间"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div
          aria-label="房间可见性"
          className="flex gap-2 rounded-xl border border-surface-border bg-background/60 p-1"
          role="tablist"
        >
          {(["public", "private"] as const).map((visibility) => (
            <button
              aria-selected={form.visibility === visibility}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer ${
                form.visibility === visibility
                  ? "bg-accent text-white"
                  : "text-foreground-muted hover:bg-surface-hover"
              }`}
              key={visibility}
              onClick={() => setForm((current) => ({ ...current, visibility }))}
              role="tab"
              type="button"
            >
              {visibility === "public" ? "公开房间" : "私密房间"}
            </button>
          ))}
        </div>
        <div aria-label="选择房间用途" className="flex flex-col gap-2" role="group">
          {(["interactive", "request", "radio"] as const).map((roomType) => (
            <button
              aria-pressed={form.roomType === roomType}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border px-4 py-3 text-left transition cursor-pointer ${
                form.roomType === roomType
                  ? "border-accent bg-accent/10 shadow-xs"
                  : "border-surface-border bg-surface/20 hover:border-white/20 hover:bg-surface-hover"
              }`}
              key={roomType}
              onClick={() => setForm((current) => ({ ...current, roomType }))}
              type="button"
            >
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {roomTypeLabel(roomType)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-foreground-muted">
                  {roomTypeDescription(roomType)}
                </span>
              </span>
              {form.roomType === roomType ? (
                <span className="text-xs font-semibold text-accent">已选择</span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-2 text-sm text-foreground">
          房间名称{" "}
          <span className="text-xs text-foreground-muted">
            留空使用“{defaultRoomName || "音乐房间"}”
          </span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            className="rounded-xl border border-surface-border bg-background px-3 py-2.5 text-sm text-foreground caret-accent outline-none placeholder:text-foreground-muted focus:border-accent focus:ring-1 focus:ring-accent"
            maxLength={120}
            onChange={(event) => {
              setLocalError(null);
              const val = event.target.value;
              setForm((current) => ({ ...current, name: val }));
            }}
            placeholder="例如：周五夜听"
            spellCheck="false"
            value={form.name}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground">
          房间简介 <span className="text-xs text-foreground-muted">可选</span>
          <textarea
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-20 resize-y rounded-xl border border-surface-border bg-background px-3 py-2.5 text-sm text-foreground caret-accent outline-none placeholder:text-foreground-muted focus:border-accent focus:ring-1 focus:ring-accent"
            maxLength={500}
            onChange={(event) => {
              const val = event.target.value;
              setForm((current) => ({ ...current, description: val }));
            }}
            placeholder="告诉大家这个房间适合做什么"
            spellCheck="false"
            value={form.description}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-foreground">
          房间密码 <span className="text-xs text-foreground-muted">可选，至少 4 位</span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            className="rounded-xl border border-surface-border bg-background px-3 py-2.5 text-sm text-foreground caret-accent outline-none placeholder:text-foreground-muted focus:border-accent focus:ring-1 focus:ring-accent"
            maxLength={128}
            minLength={4}
            onChange={(event) => {
              setLocalError(null);
              const val = event.target.value;
              setForm((current) => ({ ...current, password: val }));
            }}
            placeholder="留空表示无需密码"
            spellCheck="false"
            type="password"
            value={form.password}
          />
        </label>
        {form.roomType === "interactive" ? (
          <div className="flex flex-col gap-2">
            <div>
              <span className="block text-sm text-foreground">新成员默认权限</span>
              <span className="mt-1 block text-xs text-foreground-muted">
                控制新成员首次进入房间时可以使用的功能。
              </span>
            </div>
            <MemberPermissionControls
              disabled={isPending}
              onChange={(permission, checked) =>
                setForm((current) => ({
                  ...current,
                  newMemberPermissions: {
                    ...current.newMemberPermissions,
                    [permission]: checked
                  }
                }))
              }
              permissions={form.newMemberPermissions}
            />
          </div>
        ) : (
          <div className="border border-surface-border bg-surface/20 px-3 py-2.5 text-xs leading-5 text-foreground-muted">
            {form.roomType === "request"
              ? "成员可提交点歌，只有房主能够导入、审核与控制播放。"
              : "房主负责节目单和播放控制，听众以收听、查看节目预告和发送反应为主。"}
          </div>
        )}
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
            取消
          </Button>
          <Button data-testid="create-room-submit" disabled={isPending} type="submit">
            {isPending ? "创建中…" : "创建并进入"}
          </Button>
        </div>
      </form>
    </RoomDialog>
  );
}
