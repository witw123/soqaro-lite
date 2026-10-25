"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export const WorkspacePageActivity = createContext(true);

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export function useWorkspacePageActive() {
  const routeActive = useContext(WorkspacePageActivity);
  const documentVisible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true
  );
  return routeActive && documentVisible;
}
