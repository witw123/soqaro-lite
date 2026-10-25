"use client";

import { RoomDashboardView, type RoomDashboardViewProps } from "./RoomDashboardView";

// The interactive room is deliberately a pass-through so its rendered layout
// remains the established product baseline while the other room formats split.
export function InteractiveRoomView(props: RoomDashboardViewProps) {
  return <RoomDashboardView {...props} />;
}
