"use client";

import { buildAppEntryHref, buildWorkspaceAuthHref } from "@/lib/domain/client-shell";
import { buildRoomHref } from "@/lib/domain/room-url";

type UseRoomAppEntriesInput = {
  initialRoomId: string | null;
};

export function useRoomAppEntries({ initialRoomId }: UseRoomAppEntriesInput) {
  const workspaceEntryHref = buildAppEntryHref();
  const authEntryHref = buildWorkspaceAuthHref({
    redirectTo: initialRoomId ? buildRoomHref(initialRoomId) : workspaceEntryHref
  });

  return {
    authEntryHref,
    workspaceEntryHref
  };
}
