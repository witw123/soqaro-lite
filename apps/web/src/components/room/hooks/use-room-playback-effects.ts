"use client";

import { useEffect, type Dispatch } from "react";
import { consumeRoomSnapshotHandoff } from "@/lib/domain/room-snapshot-handoff";
import type { RoomStateEvent } from "@/features/room/room-state-reducer";

type UseRoomPlaybackEffectsInput = {
  dispatchRoomStateEvent: Dispatch<RoomStateEvent>;
  initialRoomId: string | null;
};

export function useRoomPlaybackEffects({
  dispatchRoomStateEvent,
  initialRoomId
}: UseRoomPlaybackEffectsInput) {
  useEffect(() => {
    if (!initialRoomId) {
      return;
    }

    const handoffSnapshot = consumeRoomSnapshotHandoff(initialRoomId);
    if (!handoffSnapshot) {
      return;
    }

    dispatchRoomStateEvent({
      type: "bootstrap-handoff",
      snapshot: handoffSnapshot
    });
  }, [dispatchRoomStateEvent, initialRoomId]);

}
