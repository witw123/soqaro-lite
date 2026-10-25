"use client";

import { RoomsHomePage } from "@/components/room-home";
import { AppRouteShell } from "@/components/shell";

export default function HomePage() {
  return (
    <AppRouteShell>
      <RoomsHomePage showSidebar={false} />
    </AppRouteShell>
  );
}

