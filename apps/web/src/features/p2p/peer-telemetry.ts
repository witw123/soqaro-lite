export type PeerTelemetryReport = {
  type: "peer-telemetry";
  protocolVersion: 1;
  fromPeerId: string;
  // Aggregate media rates observed by the reporter on its own browser.
  sendRateKbps: number | null;
  receiveRateKbps: number | null;
  // Whether the reporter's own browser is currently producing audible audio.
  audible: boolean | null;
  // Optional per-link sample toward the recipient (reporter -> recipient path).
  linkSendRateKbps?: number | null;
  linkReceiveRateKbps?: number | null;
  rttMs?: number | null;
  reportedAt: string;
};

export function createPeerTelemetryReport(input: {
  fromPeerId: string;
  sendRateKbps: number | null;
  receiveRateKbps: number | null;
  audible?: boolean | null;
  linkSendRateKbps?: number | null;
  linkReceiveRateKbps?: number | null;
  rttMs?: number | null;
  reportedAt?: string;
}): PeerTelemetryReport {
  return {
    type: "peer-telemetry",
    protocolVersion: 1,
    fromPeerId: input.fromPeerId,
    sendRateKbps: normalizeRate(input.sendRateKbps),
    receiveRateKbps: normalizeRate(input.receiveRateKbps),
    audible: typeof input.audible === "boolean" ? input.audible : null,
    linkSendRateKbps: normalizeRate(input.linkSendRateKbps),
    linkReceiveRateKbps: normalizeRate(input.linkReceiveRateKbps),
    rttMs: normalizeRate(input.rttMs),
    reportedAt: input.reportedAt ?? new Date().toISOString()
  };
}

export function parsePeerTelemetryReport(raw: unknown): PeerTelemetryReport | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (value.type !== "peer-telemetry" || value.protocolVersion !== 1) {
    return null;
  }
  if (typeof value.fromPeerId !== "string" || value.fromPeerId.length === 0) {
    return null;
  }
  if (typeof value.reportedAt !== "string") {
    return null;
  }
  return {
    type: "peer-telemetry",
    protocolVersion: 1,
    fromPeerId: value.fromPeerId,
    sendRateKbps: normalizeRate(value.sendRateKbps),
    receiveRateKbps: normalizeRate(value.receiveRateKbps),
    audible: typeof value.audible === "boolean" ? value.audible : null,
    linkSendRateKbps: normalizeRate(value.linkSendRateKbps),
    linkReceiveRateKbps: normalizeRate(value.linkReceiveRateKbps),
    rttMs: normalizeRate(value.rttMs),
    reportedAt: value.reportedAt
  };
}

export function encodePeerTelemetryReport(report: PeerTelemetryReport) {
  return JSON.stringify(report);
}

export function decodePeerTelemetryReport(raw: string | ArrayBuffer | Blob | null | undefined) {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return parsePeerTelemetryReport(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function sumFiniteRates(values: Array<number | null | undefined>) {
  const numbers = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0
  );
  if (numbers.length === 0) {
    return null;
  }
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function normalizeRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 10) / 10;
}
