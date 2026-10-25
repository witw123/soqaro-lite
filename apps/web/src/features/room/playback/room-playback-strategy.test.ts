import { describe, expect, it } from "vitest";
import { resolveRoomPlaybackStrategy } from "./room-playback-strategy";

describe("room playback strategy", () => {
  it("uses the shared cache and segmented streaming pipeline for every room type", () => {
    const strategies = [
      resolveRoomPlaybackStrategy("interactive"),
      resolveRoomPlaybackStrategy("request"),
      resolveRoomPlaybackStrategy("radio")
    ];

    expect(strategies[1]).toEqual(strategies[0]);
    expect(strategies[2]).toEqual(strategies[0]);
    expect(strategies[0]).toEqual({
      cache: "shared-library-and-provider",
      stream: "segmented-opus-with-rtp-fallback",
      readiness: "room-wide-cache-barrier"
    });
  });
});
