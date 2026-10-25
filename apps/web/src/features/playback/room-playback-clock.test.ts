import { afterEach, describe, expect, it } from "vitest";
import {
  calibrateRoomPlaybackClock,
  getRoomPlaybackClockNowMs,
  getRoomPlaybackClockSnapshot,
  resetRoomPlaybackClockForTests
} from "./room-playback-clock";

describe("room playback clock", () => {
  afterEach(() => resetRoomPlaybackClockForTests());

  it("uses the subscribe round-trip midpoint to align the client with server time", () => {
    expect(
      calibrateRoomPlaybackClock({
        serverNow: "2026-07-10T00:00:01.050Z",
        requestStartedAtMs: Date.parse("2026-07-10T00:00:00.000Z"),
        responseReceivedAtMs: Date.parse("2026-07-10T00:00:00.100Z")
      })
    ).toBe(true);

    expect(getRoomPlaybackClockSnapshot()).toMatchObject({
      offsetMs: 1_000,
      bestRoundTripMs: 100
    });
    expect(getRoomPlaybackClockNowMs(Date.parse("2026-07-10T00:00:02.000Z"))).toBe(
      Date.parse("2026-07-10T00:00:03.000Z")
    );
  });

  it("keeps a lower-latency calibration sample", () => {
    calibrateRoomPlaybackClock({
      serverNow: "2026-07-10T00:00:00.200Z",
      requestStartedAtMs: 0,
      responseReceivedAtMs: 200
    });
    expect(
      calibrateRoomPlaybackClock({
        serverNow: "2026-07-10T00:00:00.900Z",
        requestStartedAtMs: 300,
        responseReceivedAtMs: 800
      })
    ).toBe(false);
    expect(getRoomPlaybackClockSnapshot().bestRoundTripMs).toBe(200);
  });
});
