"use client";

import { useMemo } from "react";
import {
  selectWorkspacePeerDiagnostics,
  useRoomDerivedState,
  type UseRoomDerivedStateInput
} from "@/components/room/hooks/use-room-derived-state";

export function useRoomWorkspaceViewModel(input: UseRoomDerivedStateInput) {
  const derivedState = useRoomDerivedState(input);
  const workspacePeerDiagnostics = useMemo(
    () =>
      selectWorkspacePeerDiagnostics({
        activeDashboardTab: input.activeDashboardTab,
        visiblePeerDiagnostics: derivedState.visiblePeerDiagnostics,
        visiblePeerRecentEvents: derivedState.visiblePeerRecentEvents
      }),
    [
      derivedState.visiblePeerDiagnostics,
      derivedState.visiblePeerRecentEvents,
      input.activeDashboardTab
    ]
  );

  return {
    ...derivedState,
    workspacePeerDiagnostics
  };
}
