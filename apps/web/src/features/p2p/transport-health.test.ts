// @ts-nocheck
import { describe, expect, it } from "vitest";
import { resolveTransportHealth } from "./transport-health";

describe("transport-health", () => {
  it("reports healthy when the data channel is open", () => {
    expect(
      resolveTransportHealth({
        dataConnectionState: "connected",
        dataChannelState: "open",
        recoveryActionLevel: "observe",
        playbackTransport: "segmented-opus-local"
      })
    ).toMatchObject({
      transportHealth: "healthy",
      degradedReason: null
    });
  });

  it("treats an open data channel as ready even when a stale connection failure remains", () => {
    expect(
      resolveTransportHealth({
        dataConnectionState: "closed",
        dataChannelState: "open",
        recoveryActionLevel: "observe",
        playbackTransport: "segmented-opus-local"
      })
    ).toMatchObject({
      transportHealth: "healthy",
      degradedReason: null
    });
  });

  it("treats background peer recovery as recovering before escalating to reconnecting", () => {
    expect(
      resolveTransportHealth({
        dataConnectionState: "connected",
        dataChannelState: "open",
        recoveryActionLevel: "peer-restart",
        playbackTransport: "segmented-opus-local"
      })
    ).toMatchObject({
      transportHealth: "recovering",
      degradedReason: "peer-restart"
    });
  });

  it("reports failed when the data channel has closed", () => {
    expect(
      resolveTransportHealth({
        dataConnectionState: "disconnected",
        dataChannelState: "closed",
        recoveryActionLevel: "hard-reconnect",
        playbackTransport: null
      })
    ).toMatchObject({
      transportHealth: "failed",
      degradedReason: "transport-failed"
    });
  });

  it("does not report healthy until the data channel is open", () => {
    expect(
      resolveTransportHealth({
        dataConnectionState: "connecting",
        dataChannelState: "connecting",
        recoveryActionLevel: "observe",
        playbackTransport: "segmented-opus-local"
      })
    ).toMatchObject({
      transportHealth: "degraded",
      degradedReason: "data-connecting"
    });
  });
});
