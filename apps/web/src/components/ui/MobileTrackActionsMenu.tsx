"use client";

import { useId } from "react";
import {
  Download,
  ListPlus,
  Play,
  Plus,
  Heart,
  ArrowUpDown,
  Trash2,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { AnchoredDialog, type AnchoredDialogAnchor } from "@/components/ui/anchored-dialog";

export type MobileTrackActionIcon =
  | "download"
  | "queue"
  | "play"
  | "plus"
  | "heart"
  | "move"
  | "trash"
  | "up"
  | "down";

export type MobileTrackAction = {
  id: string;
  label: string;
  icon: MobileTrackActionIcon;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
};

export function MobileTrackActionsMenu({
  anchor,
  title,
  subtitle,
  items,
  onClose
}: {
  anchor: AnchoredDialogAnchor;
  title: string;
  subtitle?: string;
  items: readonly MobileTrackAction[];
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <AnchoredDialog anchor={anchor} ariaLabelledBy={titleId} compact onClose={onClose}>
      <div className="px-2 pb-2 pt-1">
        <h2 className="truncate text-sm font-semibold text-foreground" id={titleId}>{title}</h2>
        {subtitle ? <p className="mt-1 truncate text-xs text-foreground-muted">{subtitle}</p> : null}
      </div>
      <div className="border-t border-surface-border pt-1" role="menu">
        {items.map((item) => (
          <button
            aria-label={item.label}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 ${item.destructive ? "text-red-400 hover:text-red-300" : "text-foreground"}`}
            disabled={item.disabled}
            key={item.id}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            role="menuitem"
            type="button"
          >
            <MenuIcon name={item.icon} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </AnchoredDialog>
  );
}

function MenuIcon({ name }: { name: MobileTrackActionIcon }) {
  const className = "h-4 w-4 shrink-0";
  if (name === "download") return <Download className={className} />;
  if (name === "queue") return <ListPlus className={className} />;
  if (name === "play") return <Play className={className} fill="currentColor" />;
  if (name === "plus") return <Plus className={className} />;
  if (name === "heart") return <Heart className={className} />;
  if (name === "move") return <ArrowUpDown className={className} />;
  if (name === "trash") return <Trash2 className={className} />;
  if (name === "up") return <ChevronUp className={className} />;
  return <ChevronDown className={className} />;
}
