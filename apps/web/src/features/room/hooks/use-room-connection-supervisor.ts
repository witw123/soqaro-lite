"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import type { PeerDiagnosticsSnapshot } from "@soqaro/shared";
import type { PeerConnectionStatsSample } from "@/features/p2p/connection-stats";
import {
  createPeerConnectionSupervisorState,
  notePeerSignalState,
  observePeerTransport,
  resolveTransportHealth,
  toSupervisorDiagnosticPatch,
  type PeerConnectionSupervisorState
} from "@/features/p2p";
import type {
  ConnectionSupervisorSignalStateInput,
  PlaybackRecoveryRecommendation
} from "./room-runtime-types";

export type SourceRecoveryCoordinatorState = {
  actionKey: string | null;
  action: "soft" | "hard-recreate" | "full-resubscribe" | null;
  startedAtMs: number | null;
};

export function shouldRunMediaPeerRecovery() {
  return false;
}

export function shouldSuppressSourceRecoveryDuringGenerationBootstrap() {
  return false;
}

export function withResolvedTransportHealth(
  snapshot: PeerDiagnosticsSnapshot
): PeerDiagnosticsSnapshot {
  return {
    ...snapshot,
    ...resolveTransportHealth(snapshot)
  };
}

export function withSupervisorDiagnosticPatch(
  snapshot: PeerDiagnosticsSnapshot,
  state: PeerConnectionSupervisorState | null
): PeerDiagnosticsSnapshot {
  return state ? { ...snapshot, ...toSupervisorDiagnosticPatch(state) } : snapshot;
}

export function useRoomConnectionSupervisor(input: {
  roomId?: string | null;
  lastSubscribeAckAtRef: MutableRefObject<number | null>;
}) {
  const connectionSupervisorStatesRef = useRef<Map<string, PeerConnectionSupervisorState>>(new Map());
  const sourceRecoveryCoordinatorRef = useRef<SourceRecoveryCoordinatorState>({
    actionKey: null,
    action: null,
    startedAtMs: null
  });

  const ensureConnectionSupervisorState = useCallback((peerId: string) => {
    const existing = connectionSupervisorStatesRef.current.get(peerId);
    if (existing) {
      return existing;
    }
    const next = createPeerConnectionSupervisorState({
      peerId,
      roomId: input.roomId ?? "room"
    });
    connectionSupervisorStatesRef.current.set(peerId, next);
    return next;
  }, [input.roomId]);

  const commitConnectionSupervisorState = useCallback(
    (state: PeerConnectionSupervisorState | null | undefined) => {
      if (state) {
        connectionSupervisorStatesRef.current.set(state.peerId, state);
      }
      return state ?? null;
    },
    []
  );

  const updateConnectionSupervisorSignalState = useCallback(
    (value: ConnectionSupervisorSignalStateInput) => {
      const state = ensureConnectionSupervisorState(value.peerId);
      const next = notePeerSignalState({
        state,
        dataConnectionState: value.dataConnectionState,
        dataIceState: value.dataIceState,
        dataChannelState: value.dataChannelState,
        mediaConnectionState: value.mediaConnectionState,
        mediaIceState: value.mediaIceState,
        lastFailureReason: value.lastFailureReason
      });
      return commitConnectionSupervisorState(next);
    },
    [commitConnectionSupervisorState, ensureConnectionSupervisorState]
  );

  const updateConnectionSupervisorTransport = useCallback(
    (value: {
      peerId: string;
      dataChannelState?: string | null;
      dataConnectionState?: string | null;
      dataIceState?: string | null;
      bytesReceived?: number | null;
      bytesSent?: number | null;
      bufferedAmountBytes?: number | null;
      now?: number;
    }) => {
      const state = ensureConnectionSupervisorState(value.peerId);
      const next = observePeerTransport({
        state,
        sample: {
          candidateType: null,
          protocol: null,
          currentRoundTripTimeMs: null,
          availableOutgoingBitrateKbps: null,
          packetLossRate: null,
          packetsLost: null,
          jitterMs: null,
          mediaReceiveBitrateKbps: null,
          mediaSendBitrateKbps: null
        },
        diagnostics: {
          dataChannelState: value.dataChannelState ?? null,
          dataConnectionState: value.dataConnectionState ?? null,
          dataIceState: value.dataIceState ?? null,
          mediaConnectionState: null,
          mediaIceState: null
        },
        now: value.now
      });
      return commitConnectionSupervisorState(next);
    },
    [commitConnectionSupervisorState, ensureConnectionSupervisorState]
  );

  const updateConnectionSupervisorTransportStats = useCallback(
    (value: {
      peerId: string;
      sample: PeerConnectionStatsSample;
      channelKind?: "data" | "media";
      diagnostics?: Pick<
        PeerDiagnosticsSnapshot,
        | "dataChannelState"
        | "dataConnectionState"
        | "mediaConnectionState"
        | "dataIceState"
        | "mediaIceState"
      > | null;
      now?: number;
    }) => {
      const state = ensureConnectionSupervisorState(value.peerId);
      const channelKind = value.channelKind ?? "data";
      const next = observePeerTransport({
        state,
        sample: value.sample,
        diagnostics: value.diagnostics ?? {
          dataChannelState: channelKind === "data"
            ? value.sample.dataChannelState ?? state.dataChannelState
            : state.dataChannelState,
          dataConnectionState: channelKind === "data"
            ? value.sample.connectionState ?? state.dataConnectionState
            : state.dataConnectionState,
          dataIceState: channelKind === "data"
            ? value.sample.iceConnectionState ?? state.dataIceState
            : state.dataIceState,
          mediaConnectionState: channelKind === "media"
            ? value.sample.connectionState ?? state.mediaConnectionState
            : state.mediaConnectionState,
          mediaIceState: channelKind === "media"
            ? value.sample.iceConnectionState ?? state.mediaIceState
            : state.mediaIceState
        },
        now: value.now
      });
      return commitConnectionSupervisorState(next);
    },
    [commitConnectionSupervisorState, ensureConnectionSupervisorState]
  );

  const updateConnectionSupervisorPlayout = useCallback(() => null, []);

  const resolveCurrentAudibleSource = useCallback(
    (isSourceOwner = true) => isSourceOwner ? "segmented-opus-local" as const : "webrtc-opus-remote" as const,
    []
  );
  const resolveSourceContinuityState = useCallback(
    (isSourceOwner = true) => ({
      playbackTransport: isSourceOwner ? "segmented-opus-local" as const : "webrtc-opus-remote" as const,
      bufferingWhileAudible: false,
      recentAudioProgress: true,
      recentTransportProgress: true,
      consecutiveNoProgressMs: null,
      consecutiveDataNoProgressMs: null
    }),
    []
  );
  const resolveSourceRecoverySuppressedReason = useCallback((now = Date.now()) => {
    const lastSubscribeAckAt = input.lastSubscribeAckAtRef.current;
    return typeof lastSubscribeAckAt === "number" && now - lastSubscribeAckAt < 2_000
      ? "recent-subscribe"
      : null;
  }, [input.lastSubscribeAckAtRef]);

  const beginSourceHardRecoveryAction = useCallback(() => false, []);
  const clearSourceHardRecoveryAction = useCallback(() => undefined, []);

  return {
    connectionSupervisorStatesRef,
    sourceRecoveryCoordinatorRef,
    beginSourceHardRecoveryAction,
    clearSourceHardRecoveryAction,
    resolveCurrentAudibleSource,
    resolveSourceContinuityState,
    resolveSourceRecoverySuppressedReason,
    ensureConnectionSupervisorState,
    commitConnectionSupervisorState,
    updateConnectionSupervisorSignalState,
    updateConnectionSupervisorTransport,
    updateConnectionSupervisorTransportStats,
    updateConnectionSupervisorPlayout
  };
}

export function useRoomConnectionSupervisorRuntime(input: {
  queuePlaybackRecoveryRecommendation?: (recommendation: PlaybackRecoveryRecommendation) => void;
}) {
  void input;
}
