import type {
  PeerDiagnosticsSnapshot,
  RoomMediaConnectionState
} from "@soqaro/shared";
import type { PeerConnectionStatsSample } from "./connection-stats";

export type PeerTransportScore = "healthy" | "degraded" | "unstable" | "failed";
export type PeerRecoveryStage =
  | "idle"
  | "soft"
  | "ice-restart"
  | "hard-recreate"
  | "full-resubscribe";
export type StableTransportKind = "direct" | "relay";

type SupervisorSample = {
  timestampMs: number;
  candidateType: string | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  protocol: string | null;
  relayProtocol: string | null;
  currentRoundTripTimeMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  transportReceiveBitrateKbps: number | null;
  transportSendBitrateKbps: number | null;
  packetLossRate: number | null;
  jitterMs: number | null;
  mediaReceiveBitrateKbps: number | null;
  mediaSendBitrateKbps: number | null;
  dataChannelState: string | null;
  dataConnectionState: string | null;
  mediaConnectionState: string | null;
  dataIceState: string | null;
  mediaIceState: string | null;
};

type RecoveryBudgetState = {
  lastSoftAtByGeneration: Record<string, number>;
  lastIceRestartAtMs: number | null;
  lastHardRecreateAtMs: number | null;
  lastFullResubscribeAtMs: number | null;
};

export type PeerConnectionSupervisorState = {
  peerId: string;
  roomId: string;
  transportScore: PeerTransportScore;
  recoveryStage: PeerRecoveryStage;
  stableTransportKind: StableTransportKind | null;
  preferredTransportKind: StableTransportKind | null;
  lastFailureReason: string | null;
  lastRecoveryAction: RecoveryBudgetAction | null;
  iceRestartCount: number;
  hardRecreateCount: number;
  dataChannelState: string | null;
  dataConnectionState: string | null;
  mediaConnectionState: string | null;
  dataIceState: string | null;
  mediaIceState: string | null;
  lastSignalStateAtMs: number;
  unhealthySignalStateStartedAtMs: number | null;
  lastTransportProgressAtMs: number | null;
  lastPlayoutProgressAtMs: number | null;
  samples: SupervisorSample[];
  consecutiveDegradedWindows: number;
  consecutiveUnstableWindows: number;
  consecutiveHealthyWindows: number;
  healthyTransportSinceMs: number | null;
  lastObservedTransportKind: StableTransportKind | null;
  recoveryBudget: RecoveryBudgetState;
};

type ObserveTransportInput = {
  state: PeerConnectionSupervisorState;
  sample: PeerConnectionStatsSample;
  diagnostics?: Pick<
    PeerDiagnosticsSnapshot,
    "dataChannelState" | "dataConnectionState" | "mediaConnectionState" | "dataIceState" | "mediaIceState"
  > | null;
  now?: number;
};

type NoteSignalStateInput = {
  state: PeerConnectionSupervisorState;
  dataChannelState?: string | null;
  dataConnectionState?: string | null;
  mediaConnectionState?: string | null;
  dataIceState?: string | null;
  mediaIceState?: string | null;
  lastFailureReason?: string | null;
  now?: number;
};

type RecoveryBudgetAction = "soft" | "ice-restart" | "hard-recreate" | "full-resubscribe";

const supervisorWindowMs = 5_000;
const stableTransportPersistWindowMs = 30_000;
const stableTransportTtlMs = 30 * 60_000;
const softRecoveryBudgetMs = 800;
const iceRestartBudgetMs = 2_500;
const hardRecreateBudgetMs = 8_000;
const fullResubscribeBudgetMs = 15_000;
const storageKeyPrefix = "soqaro:stable-transport";

export function createPeerConnectionSupervisorState(input: {
  peerId: string;
  roomId: string;
  now?: number;
}): PeerConnectionSupervisorState {
  const now = input.now ?? Date.now();
  const storedTransportKind = loadStableTransportKind(input.roomId, input.peerId, now);

  return {
    peerId: input.peerId,
    roomId: input.roomId,
    transportScore: "healthy",
    recoveryStage: "idle",
    stableTransportKind: storedTransportKind,
    preferredTransportKind: storedTransportKind,
    lastFailureReason: null,
    lastRecoveryAction: null,
    iceRestartCount: 0,
    hardRecreateCount: 0,
    dataChannelState: null,
    dataConnectionState: null,
    mediaConnectionState: null,
    dataIceState: null,
    mediaIceState: null,
    lastSignalStateAtMs: now,
    unhealthySignalStateStartedAtMs: null,
    lastTransportProgressAtMs: null,
    lastPlayoutProgressAtMs: null,
    samples: [],
    consecutiveDegradedWindows: 0,
    consecutiveUnstableWindows: 0,
    consecutiveHealthyWindows: 0,
    healthyTransportSinceMs: null,
    lastObservedTransportKind: storedTransportKind,
    recoveryBudget: {
      lastSoftAtByGeneration: {},
      lastIceRestartAtMs: null,
      lastHardRecreateAtMs: null,
      lastFullResubscribeAtMs: null
    }
  };
}

export function notePeerSignalState(input: NoteSignalStateInput) {
  const now = input.now ?? Date.now();
  const dataChannelState = input.dataChannelState ?? input.state.dataChannelState;
  const previousDataConnectionState = input.dataConnectionState ?? input.state.dataConnectionState;
  const dataConnectionState =
    dataChannelState === "open" &&
    input.dataConnectionState === undefined &&
    isHardDataConnectionState(previousDataConnectionState)
      ? "connected"
      : previousDataConnectionState;
  const nextSignalState = {
    dataChannelState,
    dataConnectionState,
    mediaConnectionState: input.mediaConnectionState ?? input.state.mediaConnectionState,
    dataIceState: input.dataIceState ?? input.state.dataIceState,
    mediaIceState: input.mediaIceState ?? input.state.mediaIceState
  };
  const unhealthySignalStateStartedAtMs = isUnhealthySignalState(nextSignalState)
    ? input.state.unhealthySignalStateStartedAtMs ?? now
    : null;
  const lastFailureReason = isUnhealthySignalState(nextSignalState)
    ? resolveLastFailureReason({
        ...input,
        ...nextSignalState
      })
    : input.lastFailureReason ?? null;
  const transportScore =
    !isUnhealthySignalState(nextSignalState) &&
    dataChannelState === "open" &&
    (input.state.transportScore === "failed" || input.state.transportScore === "unstable")
      ? "degraded"
      : input.state.transportScore;

  return {
    ...input.state,
    ...nextSignalState,
    transportScore,
    lastSignalStateAtMs: now,
    unhealthySignalStateStartedAtMs,
    lastFailureReason
  };
}

function isHardDataConnectionState(state: string | null | undefined) {
  return state === "closed" || state === "failed" || state === "disconnected";
}

export function observePeerTransport(input: ObserveTransportInput) {
  const now = input.now ?? Date.now();
  const nextSample: SupervisorSample = {
    timestampMs: now,
    candidateType: input.sample.candidateType,
    localCandidateType: input.sample.localCandidateType ?? null,
    remoteCandidateType: input.sample.remoteCandidateType ?? null,
    protocol: input.sample.protocol,
    relayProtocol: input.sample.relayProtocol ?? null,
    currentRoundTripTimeMs: input.sample.currentRoundTripTimeMs,
    availableOutgoingBitrateKbps: input.sample.availableOutgoingBitrateKbps,
    transportReceiveBitrateKbps: input.sample.transportReceiveBitrateKbps ?? null,
    transportSendBitrateKbps: input.sample.transportSendBitrateKbps ?? null,
    packetLossRate: input.sample.packetLossRate ?? null,
    jitterMs: input.sample.jitterMs,
    mediaReceiveBitrateKbps: input.sample.mediaReceiveBitrateKbps,
    mediaSendBitrateKbps: input.sample.mediaSendBitrateKbps,
    dataChannelState: input.diagnostics?.dataChannelState ?? null,
    dataConnectionState: input.diagnostics?.dataConnectionState ?? null,
    mediaConnectionState: input.diagnostics?.mediaConnectionState ?? null,
    dataIceState: input.diagnostics?.dataIceState ?? null,
    mediaIceState: input.diagnostics?.mediaIceState ?? null
  };
  const samples = [...input.state.samples, nextSample].filter(
    (sample) => now - sample.timestampMs <= supervisorWindowMs
  );
  const windowClassification = classifyTransportWindow(samples);

  const consecutiveDegradedWindows =
    windowClassification === "degraded" ? input.state.consecutiveDegradedWindows + 1 : 0;
  const consecutiveUnstableWindows =
    windowClassification === "unstable" || windowClassification === "failed"
      ? input.state.consecutiveUnstableWindows + 1
      : 0;
  const consecutiveHealthyWindows =
    windowClassification === "healthy" ? input.state.consecutiveHealthyWindows + 1 : 0;

  let transportScore = input.state.transportScore;
  if (windowClassification === "failed") {
    transportScore = "failed";
  } else if (windowClassification === "unstable") {
    transportScore = consecutiveUnstableWindows >= 2 ? "unstable" : transportScore;
  } else if (windowClassification === "degraded") {
    if (transportScore === "unstable") {
      transportScore = consecutiveHealthyWindows >= 2 ? "degraded" : transportScore;
    } else {
      transportScore = consecutiveDegradedWindows >= 2 ? "degraded" : transportScore;
    }
  } else {
    if (transportScore === "failed") {
      transportScore = consecutiveHealthyWindows >= 3 ? "degraded" : transportScore;
    } else if (transportScore === "unstable") {
      transportScore = consecutiveHealthyWindows >= 2 ? "degraded" : transportScore;
    } else if (transportScore === "degraded") {
      transportScore = consecutiveHealthyWindows >= 3 ? "healthy" : transportScore;
    } else {
      transportScore = "healthy";
    }
  }

  const observedTransportKind = resolveTransportKind(nextSample.candidateType);
  let healthyTransportSinceMs = input.state.healthyTransportSinceMs;
  let stableTransportKind = input.state.stableTransportKind;
  let preferredTransportKind = input.state.preferredTransportKind;
  let iceRestartCount = input.state.iceRestartCount;
  let hardRecreateCount = input.state.hardRecreateCount;
  if (transportScore === "healthy" && observedTransportKind) {
    if (input.state.lastObservedTransportKind !== observedTransportKind) {
      healthyTransportSinceMs = now;
    } else if (healthyTransportSinceMs === null) {
      healthyTransportSinceMs = now;
    }

    if (
      healthyTransportSinceMs !== null &&
      now - healthyTransportSinceMs >= stableTransportPersistWindowMs
    ) {
      stableTransportKind = observedTransportKind;
      preferredTransportKind = observedTransportKind;
      persistStableTransportKind(input.state.roomId, input.state.peerId, observedTransportKind, now);
      // The recovery ladder achieved a stable healthy transport. Reset the
      // counters so a future degradation starts from "direct" again instead of
      // the sticky relay bias locking the peer out of recovery.
      iceRestartCount = 0;
      hardRecreateCount = 0;
    }
  } else {
    healthyTransportSinceMs = null;
  }

  if (
    iceRestartCount >= 2 &&
    hardRecreateCount === 0 &&
    preferredTransportKind !== "relay"
  ) {
    preferredTransportKind = "relay";
  }

  return {
    ...input.state,
    samples,
    transportScore,
    stableTransportKind,
    preferredTransportKind,
    iceRestartCount,
    hardRecreateCount,
    healthyTransportSinceMs,
    lastObservedTransportKind: observedTransportKind ?? input.state.lastObservedTransportKind,
    consecutiveDegradedWindows,
    consecutiveUnstableWindows,
    consecutiveHealthyWindows,
    lastTransportProgressAtMs:
      (typeof input.sample.mediaReceiveBitrateKbps === "number" &&
        input.sample.mediaReceiveBitrateKbps > 0) ||
      (typeof input.sample.mediaSendBitrateKbps === "number" &&
        input.sample.mediaSendBitrateKbps > 0)
        ? now
        : input.state.lastTransportProgressAtMs
  };
}

export function recordPeerPlayoutProgress(
  state: PeerConnectionSupervisorState,
  now = Date.now()
) {
  return {
    ...state,
    lastPlayoutProgressAtMs: now
  };
}

export function canRunRecoveryAction(input: {
  state: PeerConnectionSupervisorState;
  action: RecoveryBudgetAction;
  generation?: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();

  if (input.action === "soft") {
    const generationKey = input.generation ?? "default";
    const lastSoftAt = input.state.recoveryBudget.lastSoftAtByGeneration[generationKey] ?? null;
    return lastSoftAt === null || now - lastSoftAt >= softRecoveryBudgetMs;
  }

  if (input.action === "ice-restart") {
    return (
      input.state.recoveryBudget.lastIceRestartAtMs === null ||
      now - input.state.recoveryBudget.lastIceRestartAtMs >= iceRestartBudgetMs
    );
  }

  if (input.action === "hard-recreate") {
    return (
      input.state.recoveryBudget.lastHardRecreateAtMs === null ||
      now - input.state.recoveryBudget.lastHardRecreateAtMs >= hardRecreateBudgetMs
    );
  }

  return (
    input.state.recoveryBudget.lastFullResubscribeAtMs === null ||
    now - input.state.recoveryBudget.lastFullResubscribeAtMs >= fullResubscribeBudgetMs
  );
}

export function markRecoveryAction(input: {
  state: PeerConnectionSupervisorState;
  action: RecoveryBudgetAction;
  generation?: string | null;
  failureReason?: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const nextBudget: RecoveryBudgetState = {
    ...input.state.recoveryBudget,
    lastSoftAtByGeneration: {
      ...input.state.recoveryBudget.lastSoftAtByGeneration
    }
  };
  const generationKey = input.generation ?? "default";

  if (input.action === "soft") {
    nextBudget.lastSoftAtByGeneration[generationKey] = now;
  } else if (input.action === "ice-restart") {
    nextBudget.lastIceRestartAtMs = now;
  } else if (input.action === "hard-recreate") {
    nextBudget.lastHardRecreateAtMs = now;
  } else {
    nextBudget.lastFullResubscribeAtMs = now;
  }

  const nextHardRecreateCount = input.action === "hard-recreate"
    ? input.state.hardRecreateCount + 1
    : input.state.hardRecreateCount;
  const preferredTransportKind = input.action === "hard-recreate"
    ? input.state.hardRecreateCount > 0 && input.state.preferredTransportKind === "relay"
      ? "direct" as const
      : "relay" as const
    : input.action === "full-resubscribe"
      ? "relay" as const
      : input.action === "ice-restart" &&
          input.state.iceRestartCount + input.state.hardRecreateCount + 1 >= 2
        ? "relay" as const
        : input.state.preferredTransportKind;

  return {
    ...input.state,
    recoveryStage: input.action,
    lastRecoveryAction: input.action,
    lastFailureReason: input.failureReason ?? input.state.lastFailureReason,
    iceRestartCount:
      input.action === "ice-restart"
        ? input.state.iceRestartCount + 1
        : input.state.iceRestartCount,
    hardRecreateCount: nextHardRecreateCount,
    preferredTransportKind,
    recoveryBudget: nextBudget
  };
}

export function markMediaRecoveryAttempt(input: {
  state: PeerConnectionSupervisorState;
  restartCount: number;
  reason: string;
  now?: number;
}) {
  return markRecoveryAction({
    state: input.state,
    action: input.restartCount >= 3 ? "hard-recreate" : "ice-restart",
    failureReason: input.reason,
    now: input.now
  });
}

export function resetRecoveryStage(
  state: PeerConnectionSupervisorState
): PeerConnectionSupervisorState {
  return state.recoveryStage === "idle"
    ? state
    : {
        ...state,
        recoveryStage: "idle"
      };
}

export function toSupervisorDiagnosticPatch(state: PeerConnectionSupervisorState) {
  return {
    transportScore: state.transportScore,
    stableTransportKind: state.stableTransportKind,
    lastFailureReason: state.lastFailureReason,
    lastRecoveryAction: state.lastRecoveryAction,
    recoveryActionLevel:
      state.recoveryStage === "soft"
        ? ("soft-data-retry" as const)
        : state.recoveryStage === "ice-restart"
          ? ("peer-restart" as const)
          : state.recoveryStage === "hard-recreate"
            ? ("hard-reconnect" as const)
            : state.recoveryStage === "full-resubscribe"
              ? ("full-resubscribe" as const)
              : ("observe" as const),
    iceRestartCount: state.iceRestartCount,
    hardRecreateCount: state.hardRecreateCount
  } as const;
}

/**
 * A relay-capable ICE server is one whose URLs include turn:/turns:. When the
 * active ICE configuration has no TURN server (stun-only fallback), forcing
 * `iceTransportPolicy: "relay"` gathers zero candidates and every rebuilt
 * media connection fails forever, so the relay preference must be ignored.
 */
export function hasRelayIceServer(
  iceServers: ReadonlyArray<{ urls: string | ReadonlyArray<string> }> | null | undefined
) {
  if (!iceServers) {
    return false;
  }
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => {
      const normalized = url.trim().toLowerCase();
      return normalized.startsWith("turn:") || normalized.startsWith("turns:");
    });
  });
}

export function resolvePreferredIceTransportPolicy(
  state: PeerConnectionSupervisorState | null | undefined,
  iceServers?: ReadonlyArray<{ urls: string | ReadonlyArray<string> }> | null
) {
  // Direct UDP remains the normal path. After repeated ICE failures, rebuild
  // one media incarnation with relay-only candidates so Chromium cannot select
  // the same broken NAT mapping again. A subsequent failed hard recreation
  // flips the preference back to `all`, which prevents a bad TURN deployment
  // from permanently stranding the peer.
  if (iceServers !== undefined && !hasRelayIceServer(iceServers)) {
    return "all" as const;
  }
  return state?.preferredTransportKind === "relay"
    ? "relay" as const
    : "all" as const;
}

export function resolveTransportKind(candidateType: string | null | undefined): StableTransportKind | null {
  if (!candidateType) {
    return null;
  }

  return candidateType === "relay" ? "relay" : "direct";
}

function classifyTransportWindow(samples: SupervisorSample[]): PeerTransportScore {
  const latest = samples[samples.length - 1] ?? null;
  if (!latest) {
    return "healthy";
  }

  const iceFailed = [latest.dataIceState, latest.mediaIceState].some(
    (state) => state === "failed" || state === "closed"
  );
  const connectionFailed = [latest.dataConnectionState, latest.mediaConnectionState].some(
    (state) => state === "failed" || state === "closed"
  );
  if (iceFailed || connectionFailed) {
    return "failed";
  }

  const averageRttMs = averageOf(samples.map((sample) => sample.currentRoundTripTimeMs));
  const averageLossRate = averageOf(samples.map((sample) => sample.packetLossRate));
  const averageJitterMs = averageOf(samples.map((sample) => sample.jitterMs));
  const averageReceiveBitrateKbps = averageOf(
    samples.map((sample) => sample.mediaReceiveBitrateKbps)
  );
  const averageSendBitrateKbps = averageOf(samples.map((sample) => sample.mediaSendBitrateKbps));
  const dataSamples = samples.filter((sample) => sample.dataChannelState !== null);
  const averageDataOpenRatio = dataSamples.length === 0
    ? 1
    : dataSamples.filter((sample) => sample.dataChannelState === "open").length / dataSamples.length;
  const checkingRatio =
    samples.filter(
      (sample) =>
        sample.dataIceState === "checking" ||
        sample.mediaIceState === "checking" ||
        sample.dataConnectionState === "disconnected" ||
        sample.mediaConnectionState === "disconnected"
    ).length / samples.length;

  if (
    (typeof averageRttMs === "number" && averageRttMs >= 220) ||
    (typeof averageLossRate === "number" && averageLossRate >= 8) ||
    (typeof averageJitterMs === "number" && averageJitterMs >= 45) ||
    (typeof averageReceiveBitrateKbps === "number" &&
      averageReceiveBitrateKbps <= 4 &&
      !(typeof averageSendBitrateKbps === "number" && averageSendBitrateKbps > 4)) ||
    checkingRatio >= 0.75
  ) {
    return "unstable";
  }

  if (
    (typeof averageRttMs === "number" && averageRttMs >= 140) ||
    (typeof averageLossRate === "number" && averageLossRate >= 3) ||
    (typeof averageJitterMs === "number" && averageJitterMs >= 20) ||
    averageDataOpenRatio < 0.75 ||
    checkingRatio >= 0.4
  ) {
    return "degraded";
  }

  return "healthy";
}

function averageOf(values: Array<number | null>) {
  const resolved = values.filter((value): value is number => typeof value === "number");
  if (resolved.length === 0) {
    return null;
  }

  return resolved.reduce((sum, value) => sum + value, 0) / resolved.length;
}

function resolveLastFailureReason(input: NoteSignalStateInput) {
  if (input.lastFailureReason !== undefined) {
    return input.lastFailureReason;
  }

  const mediaConnectionState = input.mediaConnectionState as RoomMediaConnectionState | null | undefined;
  if (mediaConnectionState === "failed") {
    return "media-failed";
  }

  if (input.dataConnectionState === "failed") {
    return "data-failed";
  }

  if (input.mediaIceState === "failed" || input.dataIceState === "failed") {
    return "ice-failed";
  }

  return input.state.lastFailureReason;
}

function isUnhealthySignalState(
  state: Pick<
    PeerConnectionSupervisorState,
    | "dataChannelState"
    | "dataConnectionState"
    | "mediaConnectionState"
    | "dataIceState"
    | "mediaIceState"
  >
) {
  const hardStates = new Set(["checking", "connecting", "disconnected", "failed", "closed"]);
  return (
    hardStates.has(state.dataChannelState ?? "") ||
    hardStates.has(state.dataConnectionState ?? "") ||
    hardStates.has(state.mediaConnectionState ?? "") ||
    hardStates.has(state.dataIceState ?? "") ||
    hardStates.has(state.mediaIceState ?? "")
  );
}

function loadStableTransportKind(roomId: string, peerId: string, now: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(buildStableTransportStorageKey(roomId, peerId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      transportKind?: StableTransportKind;
      expiresAtMs?: number;
    };
    if (
      (parsed.transportKind !== "direct" && parsed.transportKind !== "relay") ||
      typeof parsed.expiresAtMs !== "number" ||
      parsed.expiresAtMs <= now
    ) {
      window.localStorage.removeItem(buildStableTransportStorageKey(roomId, peerId));
      return null;
    }

    return parsed.transportKind;
  } catch {
    window.localStorage.removeItem(buildStableTransportStorageKey(roomId, peerId));
    return null;
  }
}

function persistStableTransportKind(
  roomId: string,
  peerId: string,
  transportKind: StableTransportKind,
  now: number
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildStableTransportStorageKey(roomId, peerId),
    JSON.stringify({
      transportKind,
      expiresAtMs: now + stableTransportTtlMs
    })
  );
}

function buildStableTransportStorageKey(roomId: string, peerId: string) {
  return `${storageKeyPrefix}:${roomId}:${peerId}`;
}
