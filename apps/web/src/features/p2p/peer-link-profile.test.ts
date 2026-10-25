import { describe, expect, it } from "vitest";
import {
  isPeerTransportAllowed,
  resolvePeerLinkProfile
} from "./peer-link-profile";

describe("peer link profile", () => {
  it("accepts direct and supported relay routes", () => {
    expect(isPeerTransportAllowed({})).toBe(true);
    expect(isPeerTransportAllowed({ candidateType: "host" })).toBe(true);
    expect(isPeerTransportAllowed({ candidateType: "relay", protocol: "udp" })).toBe(true);
    expect(isPeerTransportAllowed({ candidateType: "relay", protocol: "tcp" })).toBe(true);
  });

  it("classifies healthy direct and degraded relay paths", () => {
    expect(resolvePeerLinkProfile({
      candidateType: "host",
      protocol: "udp",
      currentRoundTripTimeMs: 30,
      incomingRateKbps: 4_000
    })).toBe("fast-direct");
    expect(resolvePeerLinkProfile({
      candidateType: "relay",
      relayProtocol: "tcp",
      currentRoundTripTimeMs: 500
    })).toBe("constrained");
  });
});
