"use client";

import type { ProviderSearchSuggestion } from "@soqaro/shared";

export type SearchSuggestionItem = {
  label: string;
  hint?: string | null;
  provider?: ProviderSearchSuggestion["provider"];
};

export function SearchSuggestions({
  items,
  onSelect,
  position = "overlay",
  onInteractionChange
}: {
  items: SearchSuggestionItem[];
  onSelect: (value: string) => void;
  position?: "overlay" | "flow";
  onInteractionChange?: (active: boolean) => void;
}) {
  if (!items.length) return null;
  return (
    <div
      className={`${position === "overlay" ? "absolute inset-x-0 top-full z-40 mt-1.5" : "relative mt-1.5"} max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-surface-border bg-surface p-1.5 shadow-lg backdrop-blur-md`}
      role="listbox"
      onPointerDownCapture={() => onInteractionChange?.(true)}
      onPointerUpCapture={() => {
        window.setTimeout(() => onInteractionChange?.(false), 200);
      }}
    >
      {items.map((item) => (
        <button
          className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs sm:text-sm text-foreground-muted transition hover:bg-surface-hover hover:text-foreground active:bg-foreground/[0.06]"
          key={`${item.label}:${item.provider ?? "local"}:${item.hint ?? ""}`}
          onClick={(e) => {
            e.preventDefault();
            onSelect(item.label);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") {
              event.preventDefault();
            }
          }}
          role="option"
          type="button"
        >
          <span className="shrink-0 text-foreground-muted/60"><SearchIcon /></span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            {item.provider ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent font-medium">{providerLabel(item.provider)}</span> : null}
            {item.hint ? <span className="text-foreground-muted/80">{item.hint}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function providerLabel(provider: ProviderSearchSuggestion["provider"]) {
  return provider === "netease" ? "网易云音乐" : "QQ 音乐";
}

function SearchIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}
