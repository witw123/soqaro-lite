"use client";

import { useCallback } from "react";
import type { PeerDiagnosticRecorder } from "@/features/p2p/use-peer-diagnostics";
import type { RoomRuntimeEvent } from "./room-runtime-types";

export function useRoomDiagnosticsBridge(input: {
  recordPeerDiagnostic: PeerDiagnosticRecorder;
  setStatusMessage: (value: string) => void;
}) {
  const { recordPeerDiagnostic, setStatusMessage } = input;
  return useCallback(
    (event: RoomRuntimeEvent) => {
      if (event.type === "status") {
        setStatusMessage(event.message);
        return;
      }

      recordPeerDiagnostic({
        peerId: event.peerId,
        channelKind: event.channelKind,
        direction: event.direction,
        event: event.event,
        summary: event.summary,
        level: event.level,
        recordEvent: event.recordEvent,
        update: event.update
      });
    },
    [recordPeerDiagnostic, setStatusMessage]
  );
}
