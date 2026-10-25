"use client";

import type { MutableRefObject, RefObject } from "react";
import type {
  AuthSession,
  PeerDiagnosticsSnapshot,
  RoomSnapshot
} from "@soqaro/shared";
import type { PeerConnectionStatsSample } from "@/features/p2p/connection-stats";
import type { PeerConnectionSupervisorState } from "@/features/p2p/connection-supervisor";
import type { PeerDiagnosticRecorder } from "@/features/p2p/use-peer-diagnostics";
import type { RoomSocket } from "@/lib/network/ws-client";
import type { UploadedTrack } from "@/features/library/audio-utils";

export type DataMeshBridge = {
  syncPeers(
    peerIds: string[],
    options?: { forceReconnectDegraded?: boolean }
  ): Promise<boolean>;
  restartPeer(peerId: string): Promise<unknown>;
  restartMediaPeer?(
    peerId: string,
    options?: { forceRecreate?: boolean; forceIceRestart?: boolean }
  ): Promise<unknown>;
  getConnectedPeerIds(): string[];
  isReady(): boolean;
};

export type DataTransportStatsInput = {
  peerId: string;
  sample?: PeerConnectionStatsSample &
    Partial<{
      connectionState: string | null;
      iceConnectionState: string | null;
      dataChannelState: string | null;
    }>;
};

export type ConnectionSupervisorSignalStateInput = {
  peerId: string;
  channelKind: "data" | "media";
  dataConnectionState?: string;
  dataIceState?: string;
  dataChannelState?: string;
  lastFailureReason?: string;
  mediaConnectionState?: string;
  mediaIceState?: string;
};

export type RoomDataMeshDiagnosticsRefs = {
  recordPeerDiagnosticRef: MutableRefObject<PeerDiagnosticRecorder>;
  updatePeerBufferedAmountRef: MutableRefObject<
    (peerId: string, bufferedAmountBytes: number) => void
  >;
  updateDataTransportStatsRef: MutableRefObject<(input: DataTransportStatsInput) => void>;
  updateMediaTransportStatsRef?: MutableRefObject<(input: DataTransportStatsInput) => void>;
  connectionSupervisorStatesRef: MutableRefObject<Map<string, PeerConnectionSupervisorState>>;
  updateConnectionSupervisorSignalState: (
    input: ConnectionSupervisorSignalStateInput
  ) => PeerConnectionSupervisorState | null;
  updateConnectionSupervisorTransportStats: (input: {
    peerId: string;
    sample: PeerConnectionStatsSample;
    channelKind: "data" | "media";
  }) => PeerConnectionSupervisorState | null;
  withResolvedTransportHealth: (
    snapshot: PeerDiagnosticsSnapshot
  ) => PeerDiagnosticsSnapshot;
  withSupervisorDiagnosticPatch: (
    snapshot: PeerDiagnosticsSnapshot,
    state: PeerConnectionSupervisorState | null
  ) => PeerDiagnosticsSnapshot;
};

export type PlaybackConnectionKey = string;

export type PlaybackRecoveryAction = {
  actionId: string;
  playbackConnectionKey: PlaybackConnectionKey;
  actionType: "restart-data-peer" | "full-resubscribe";
  peerId: string | null;
  startedAt: string;
  expiresAt: string;
  result: "running" | "completed" | "failed" | "dropped";
  reason: string;
};

export type PlaybackRecoveryDropReason =
  | "stale-connection-key"
  | "lower-priority-running"
  | "suppressed-by-guard"
  | "missing-peer";

export type PlaybackRecoveryRecommendation = {
  playbackConnectionKey: PlaybackConnectionKey | null;
  peerId: string | null;
  scope: "data" | "room";
  level: "soft" | "hard-recreate" | "full-resubscribe";
  reason: string;
  observedNoProgressMs: number | null;
};

export type RoomRecoveryPhase =
  | "joining"
  | "resyncing"
  | "bootstrapping-data"
  | "steady";

export type RoomRecoveryMode = "late-join" | "rejoin" | "steady";

export type RoomRecoveryState = {
  phase: RoomRecoveryPhase;
  mode: RoomRecoveryMode;
  generation: number | null;
  bootstrapStartedAt: string | null;
  bootstrapSourcePeerId: string | null;
  pendingSnapshot: boolean;
  pendingData: boolean;
  pendingMedia: boolean;
  listenerBootstrapAttempts: number | null;
};

export type RoomRuntimeEvent =
  | {
      type: "diagnostic";
      peerId: string;
      channelKind: "data" | "system";
      direction: "local" | "sent" | "received";
      event: string;
      summary: string;
      level?: "info" | "warning" | "error";
      recordEvent?: boolean;
      update?: (snapshot: PeerDiagnosticsSnapshot) => PeerDiagnosticsSnapshot;
    }
  | {
      type: "status";
      message: string;
    };

export type RoomRuntimeBaseContext = {
  roomSnapshot: RoomSnapshot | null;
  currentRoomRef: MutableRefObject<RoomSnapshot | null>;
  peerId: string;
  activeSession: AuthSession | null;
  socketRef: MutableRefObject<RoomSocket | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  uploadedTracks: Record<string, UploadedTrack>;
};
