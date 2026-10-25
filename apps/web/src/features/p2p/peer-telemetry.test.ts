import { describe, expect, it } from "vitest";
import {
  createPeerTelemetryReport,
  decodePeerTelemetryReport,
  parsePeerTelemetryReport,
  sumFiniteRates
} from "./peer-telemetry";

describe("peer telemetry protocol", () => {
  it("round-trips a telemetry report", () => {
    const report = createPeerTelemetryReport({
      fromPeerId: "peer_a",
      sendRateKbps: 192.45,
      receiveRateKbps: 0,
      audible: true,
      linkSendRateKbps: 96.2,
      linkReceiveRateKbps: null,
      rttMs: 42.2,
      reportedAt: "2026-07-16T00:00:00.000Z"
    });

    expect(report.sendRateKbps).toBe(192.5);
    expect(report.audible).toBe(true);
    expect(parsePeerTelemetryReport(report)).toEqual(report);
    expect(decodePeerTelemetryReport(JSON.stringify(report))).toEqual(report);
  });

  it("rejects unknown payloads", () => {
    expect(parsePeerTelemetryReport({ type: "legacy" })).toBeNull();
    expect(decodePeerTelemetryReport("{bad json")).toBeNull();
  });

  it("sums finite rates", () => {
    expect(sumFiniteRates([10, null, 5.55, undefined])).toBe(15.6);
    expect(sumFiniteRates([null, undefined])).toBeNull();
  });
});
