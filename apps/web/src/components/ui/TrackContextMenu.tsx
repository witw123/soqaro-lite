"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
};

export type TrackContextMenuProps = {
  position: { x: number; y: number } | null;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: ContextMenuItem[];
};

export function TrackContextMenu({
  position,
  onClose,
  title,
  subtitle,
  items
}: TrackContextMenuProps) {
  if (!position) return null;

  return (
    <DropdownMenu open={Boolean(position)} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: 1,
            height: 1,
            pointerEvents: "none"
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={2}
        className="min-w-[176px] max-w-[240px] p-1"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {title ? (
          <div className="border-b border-surface-border/50 px-2.5 py-1.5 mb-1">
            <p className="truncate text-xs font-semibold text-foreground">{title}</p>
            {subtitle ? (
              <p className="truncate text-xs text-foreground-muted mt-0.5">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-0.5">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              destructive={item.destructive}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className="gap-2 text-xs"
            >
              {item.icon ? (
                <span className="shrink-0 opacity-70 group-hover:opacity-100" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className="truncate">{item.label}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
