"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { AuthSession, RoomSnapshot } from "@soqaro/shared";
import type { P2PMesh } from "@/features/p2p";
import type { PeerDiagnosticRecorder } from "@/features/p2p/use-peer-diagnostics";
import type { RoomSocket } from "@/lib/network/ws-client";
import type { RoomRecoveryState } from "./room-runtime-types";

export function useRoomRuntimeMutableState(input: {
  initialRoomId: string | null;
  roomSnapshot: RoomSnapshot | null;
  currentRoomRef: MutableRefObject<RoomSnapshot | null>;
  activeSession: AuthSession | null;
  activeSessionRef: MutableRefObject<AuthSession | null>;
  socketRef: MutableRefObject<RoomSocket | null>;
  roomRecoveryState: RoomRecoveryState;
  deleteUploadedTrackArtifacts: (trackId: string) => Promise<void> | void;
  deleteRoomTrackArtifacts: (trackIds: string[], roomId?: string, deleteRoomSnapshot?: boolean) => Promise<void> | void;
  resetPlayerSurface: () => void;
  recordPeerDiagnostic: PeerDiagnosticRecorder;
}) {
  const meshRef = useRef<P2PMesh | null>(null);
  const initialRecoveryAttemptRef = useRef<string | null>(null);
  const previousInitialRoomIdRef = useRef<string | null>(input.initialRoomId);
  const activeRouteRoomIdRef = useRef<string | null>(input.initialRoomId);
  const socketDisconnectGraceUntilRef = useRef<number | null>(null);
  const resubscribeRoomRef = useRef<(() => void) | null>(null);
  const recoveryGenerationRef = useRef<number | null>(input.roomRecoveryState.generation);
  const roomRecoveryStateRef = useRef(input.roomRecoveryState);
  const lastSubscribeAckAtRef = useRef<number | null>(null);
  const recoveryModeRef = useRef<"late-join" | "rejoin" | "steady">("steady");
  const lastRealtimeRoomEventAtRef = useRef<number>(Date.now());
  const lastDataActivityAtRef = useRef<number | null>(null);
  const socketDisconnectGraceTimeoutRef = useRef<number | null>(null);
  const deleteUploadedTrackArtifactsRef = useRef(input.deleteUploadedTrackArtifacts);
  const deleteRoomTrackArtifactsRef = useRef(input.deleteRoomTrackArtifacts);
  const resetPlayerSurfaceRef = useRef(input.resetPlayerSurface);
  const recordPeerDiagnosticRef = useRef(input.recordPeerDiagnostic);

  const clearSocketDisconnectGrace = useCallback(() => {
    if (socketDisconnectGraceTimeoutRef.current !== null) {
      window.clearTimeout(socketDisconnectGraceTimeoutRef.current);
      socketDisconnectGraceTimeoutRef.current = null;
    }
    socketDisconnectGraceUntilRef.current = null;
  }, []);

  useEffect(() => {
    input.activeSessionRef.current = input.activeSession;
  }, [input.activeSession, input.activeSessionRef]);

  useEffect(() => {
    input.currentRoomRef.current = input.roomSnapshot;
  }, [input.roomSnapshot, input.currentRoomRef]);

  useEffect(() => {
    recoveryGenerationRef.current = input.roomRecoveryState.generation;
    recoveryModeRef.current = input.roomRecoveryState.mode;
    roomRecoveryStateRef.current = input.roomRecoveryState;
  }, [input.roomRecoveryState]);

  useEffect(() => {
    deleteUploadedTrackArtifactsRef.current = input.deleteUploadedTrackArtifacts;
  }, [input.deleteUploadedTrackArtifacts]);

  useEffect(() => {
    deleteRoomTrackArtifactsRef.current = input.deleteRoomTrackArtifacts;
  }, [input.deleteRoomTrackArtifacts]);

  useEffect(() => {
    resetPlayerSurfaceRef.current = input.resetPlayerSurface;
  }, [input.resetPlayerSurface]);

  useEffect(() => {
    recordPeerDiagnosticRef.current = input.recordPeerDiagnostic;
  }, [input.recordPeerDiagnostic]);

  return {
    meshRef,
    initialRecoveryAttemptRef,
    previousInitialRoomIdRef,
    activeRouteRoomIdRef,
    socketDisconnectGraceUntilRef,
    resubscribeRoomRef,
    recoveryGenerationRef,
    roomRecoveryStateRef,
    lastSubscribeAckAtRef,
    recoveryModeRef,
    lastRealtimeRoomEventAtRef,
    lastDataActivityAtRef,
    socketDisconnectGraceTimeoutRef,
    deleteUploadedTrackArtifactsRef,
    deleteRoomTrackArtifactsRef,
    resetPlayerSurfaceRef,
    recordPeerDiagnosticRef,
    clearSocketDisconnectGrace
  };
}
