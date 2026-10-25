"use client";

import { memo } from "react";
import type { AuthSession } from "@soqaro/shared";
import { Button } from "@/components/ui/button";

type TopBarProps = {
  activeSession: AuthSession | null;
  onLogout?: () => void;
  variant?: "app" | "marketing";
};

function TopBarBase({ activeSession, onLogout, variant = "app" }: TopBarProps) {
  const isMarketing = variant === "marketing";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 min-w-0 items-center gap-3 md:h-16">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-xs">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="min-w-0 leading-none">
            <span className="block truncate text-sm font-bold tracking-tight text-foreground">Soqaro</span>
            <span className="hidden text-xs text-foreground-muted sm:block">实时协作听歌空间</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {isMarketing ? (
            <>
              <nav className="hidden items-center gap-5 text-sm text-foreground-muted md:flex">
                <a className="transition-colors hover:text-foreground" href="#project">产品概览</a>
                <a className="transition-colors hover:text-foreground" href="#features">核心特性</a>
                <a className="transition-colors hover:text-foreground" href="#architecture">技术架构</a>
              </nav>
              <a
                href="https://example.test/soqaro"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                GitHub
              </a>
            </>
          ) : null}

          {activeSession && onLogout ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              type="button"
              className="px-2 text-foreground-muted hover:bg-surface hover:text-foreground sm:px-3"
            >
              退出
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarBase);
