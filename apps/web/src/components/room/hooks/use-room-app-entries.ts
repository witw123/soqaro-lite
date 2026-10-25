"use client";

import { buildAppEntryHref, buildWorkspaceAuthHref } from "@/lib/domain/client-shell";

type UseRoomAppEntriesInput = {
  initialRoomId: string | null;
};

export function useRoomAppEntries({ initialRoomId }: UseRoomAppEntriesInput) {
  const workspaceEntryHref = buildAppEntryHref();
  const authEntryHref = buildWorkspaceAuthHref({
    redirectTo: initialRoomId ? `/room/${initialRoomId}` : workspaceEntryHref
  });

  return {
    authEntryHref,
    workspaceEntryHref
  };
}
