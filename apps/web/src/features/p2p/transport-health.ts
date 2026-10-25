import type { PeerDiagnosticsSnapshot } from "@soqaro/shared";

export function isDataChannelReady(
  snapshot: Pick<PeerDiagnosticsSnapshot, "dataChannelState">
) {
  return snapshot.dataChannelState === "open";
}

export function resolveTransportHealth(
  snapshot: Pick<
    PeerDiagnosticsSnapshot,
    | "dataConnectionState"
    | "dataChannelState"
    | "recoveryActionLevel"
    | "playbackTransport"
  >
) {
  const dataReady = isDataChannelReady(snapshot);
  const audible = snapshot.playbackTransport !== null;
  const failed =
    !dataReady &&
    (snapshot.dataConnectionState === "failed" ||
      snapshot.dataConnectionState === "closed" ||
      snapshot.dataChannelState === "closed");
  const degraded = (snapshot.dataConnectionState === "connecting" && audible) || false;
  const reconnecting =
    snapshot.dataConnectionState === "connecting" ||
    snapshot.dataConnectionState === "disconnected";
  const recoveryActionLevel = snapshot.recoveryActionLevel ?? "observe";
  const hardRecoveryActive =
    recoveryActionLevel === "hard-reconnect" || recoveryActionLevel === "full-resubscribe";
  const anyRecoveryActive = recoveryActionLevel !== "observe";

  if (failed) {
    return {
      transportHealth: "failed" as const,
      degradedReason: "transport-failed"
    };
  }

  if (anyRecoveryActive) {
    return {
      transportHealth: hardRecoveryActive && !audible ? ("reconnecting" as const) : ("recovering" as const),
      degradedReason:
        recoveryActionLevel === "full-resubscribe"
            ? "full-resubscribe"
          : recoveryActionLevel === "hard-reconnect"
            ? "hard-reconnect"
            : recoveryActionLevel === "peer-restart"
            ? "peer-restart"
              : "soft-data-retry"
    };
  }

  if (degraded) {
    return {
      transportHealth: "degraded" as const,
      degradedReason: "data-connecting"
    };
  }

  if (reconnecting && !dataReady) {
    return {
      transportHealth: audible ? ("degraded" as const) : ("reconnecting" as const),
      degradedReason: audible ? "transport-degraded" : "transport-reconnecting"
    };
  }

  if (dataReady) {
    return {
      transportHealth: "healthy" as const,
      degradedReason: null
    };
  }

  return {
    transportHealth: null,
    degradedReason: null
  };
}
