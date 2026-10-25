export type PeerLinkProfile =
  | "fast-direct"
  | "standard-direct"
  | "relay-udp"
  | "constrained"
  | "severe";

export type PeerLinkProfileInput = {
  currentRoundTripTimeMs?: number | null;
  incomingRateKbps?: number | null;
  outgoingRateKbps?: number | null;
  transportReceiveBitrateKbps?: number | null;
  transportSendBitrateKbps?: number | null;
  downloadRateKbps?: number | null;
  uploadRateKbps?: number | null;
  candidateType?: string | null;
  protocol?: string | null;
  relayProtocol?: string | null;
  transportScore?: "healthy" | "degraded" | "unstable" | "failed" | null;
  bufferedAmountBytes?: number | null;
  mediaTrackActive?: boolean;
  mediaBitrateKbps?: number | null;
};

export function isPeerTransportAllowed(input: PeerLinkProfileInput) {
  const candidateType = normalizeCandidateType(input.candidateType);
  const protocol = normalizeProtocol(input.relayProtocol ?? input.protocol);
  if (!candidateType) {
    return true;
  }
  if (candidateType === "relay") {
    return protocol === null || protocol === "udp" || protocol === "tcp" || protocol === "tls";
  }
  return (
    candidateType === "direct" ||
    candidateType === "host" ||
    candidateType === "srflx" ||
    candidateType === "prflx"
  );
}

export function resolvePeerLinkProfile(
  input: PeerLinkProfileInput,
  direction: "incoming" | "outgoing" = "incoming"
): PeerLinkProfile {
  const bufferedAmountBytes = finitePositive(input.bufferedAmountBytes) ?? 0;
  const roundTripTimeMs = finitePositive(input.currentRoundTripTimeMs);
  const transferRateKbps = direction === "outgoing"
    ? resolveOutgoingRateKbps(input)
    : resolveIncomingRateKbps(input);
  const protocol = normalizeProtocol(input.relayProtocol ?? input.protocol);
  const candidateType = normalizeCandidateType(input.candidateType);
  const isRelay = candidateType === "relay";
  const isDirectCandidate = !isRelay && candidateType !== null;

  if (input.transportScore === "failed" || input.transportScore === "unstable") {
    return "severe";
  }

  if (isRelay && protocol === "udp") {
    return "relay-udp";
  }

  const severelySlowMeasuredRate =
    transferRateKbps !== null &&
    transferRateKbps < 800 &&
    !isDirectCandidate;

  if (
    input.transportScore === "degraded" ||
    (isRelay && protocol !== "udp") ||
    protocol === "tcp" ||
    bufferedAmountBytes >= 8 * 1024 * 1024 ||
    (roundTripTimeMs !== null && roundTripTimeMs >= 320) ||
    severelySlowMeasuredRate
  ) {
    return "constrained";
  }

  if (isRelay && protocol === "udp") {
    return "relay-udp";
  }

  if (
    protocol !== "tcp" &&
    bufferedAmountBytes < 256 * 1024 &&
    roundTripTimeMs !== null &&
    roundTripTimeMs <= 140 &&
    transferRateKbps !== null &&
    transferRateKbps >= 3_000
  ) {
    return "fast-direct";
  }

  return "standard-direct";
}

export function isSeverePeerLink(input: PeerLinkProfileInput) {
  return resolvePeerLinkProfile(input) === "severe";
}

function finitePositive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function resolveIncomingRateKbps(input: PeerLinkProfileInput) {
  return (
    finitePositive(input.incomingRateKbps) ??
    finitePositive(input.transportReceiveBitrateKbps) ??
    finitePositive(input.downloadRateKbps)
  );
}

function resolveOutgoingRateKbps(input: PeerLinkProfileInput) {
  return (
    finitePositive(input.outgoingRateKbps) ??
    finitePositive(input.transportSendBitrateKbps) ??
    finitePositive(input.uploadRateKbps)
  );
}

function normalizeCandidateType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function normalizeProtocol(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}
