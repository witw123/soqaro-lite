"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { AppSidebar } from "./AppSidebar";
import { AwayRoomReturnButton } from "@/components/room-home";
import { MobileAppNavigation } from "./MobileAppNavigation";
import { awayRoomChangeEvent, readAwayRoomId, requestAwayRoomResume } from "@/lib/domain/away-room";
import { buildRoomHref } from "@/lib/domain/room-url";
import { useCustomLayoutRuntime } from "@/features/settings/use-custom-layout-runtime";
import { WorkspacePageActivity } from "@/features/workspace/page-activity";

export function AppRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useCustomLayoutRuntime(pathname);
  const [awayRoomId, setAwayRoomId] = useState<string | null>(null);

  useEffect(() => {
    const syncAwayRoom = () => setAwayRoomId(readAwayRoomId());
    syncAwayRoom();
    window.addEventListener(awayRoomChangeEvent, syncAwayRoom);
    window.addEventListener("storage", syncAwayRoom);
    return () => {
      window.removeEventListener(awayRoomChangeEvent, syncAwayRoom);
      window.removeEventListener("storage", syncAwayRoom);
    };
  }, []);

  function handleResumeAwayRoom() {
    if (!awayRoomId) return;
    requestAwayRoomResume(awayRoomId);
    router.push(buildRoomHref(awayRoomId) as Route);
  }

  return (
    <div className="min-h-[calc(100*var(--app-dvh))] overflow-x-hidden bg-background text-foreground">
      <div className="hidden md:contents">
        <AppSidebar hasBottomPlayer />
      </div>
      {awayRoomId ? <AwayRoomReturnButton onClick={handleResumeAwayRoom} /> : null}
      <div className="mobile-app-route-view custom-layout-content-region md:contents">
        <WorkspacePageActivity.Provider value={true}>
          {children}
        </WorkspacePageActivity.Provider>
      </div>
      <MobileAppNavigation />
    </div>
  );
}
