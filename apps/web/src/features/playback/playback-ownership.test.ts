import { describe, expect, it } from "vitest";
import { resolvePlaybackOwnership } from "./playback-ownership";

describe("playback ownership", () => {
  it("hands personal playback to the room, keeps it while away, and returns it on exit", () => {
    expect(resolvePlaybackOwnership("/app", null, false).owner).toBe("local");
    expect(resolvePlaybackOwnership("/room/one", null, false)).toEqual({
      owner: "room", routeRoomId: "one", runtimeRoomId: "one"
    });
    expect(resolvePlaybackOwnership("/app/search", "one", false)).toEqual({
      owner: "room", routeRoomId: null, runtimeRoomId: "one"
    });
    expect(resolvePlaybackOwnership("/room/one", "one", false).runtimeRoomId).toBe("one");
    expect(resolvePlaybackOwnership("/app", null, false).owner).toBe("local");
  });

  it("does not fall back to personal media for an empty or still-joining room", () => {
    expect(resolvePlaybackOwnership("/room/empty", null, false).owner).toBe("room");
  });

  it("lets the destination room supersede the away-room pointer", () => {
    expect(resolvePlaybackOwnership("/room/two", "one", false).runtimeRoomId).toBe("two");
  });

  it("does not start media on auth, marketing or detached lyrics pages", () => {
    for (const path of ["/", "/auth", "/desktop-lyrics"]) {
      expect(resolvePlaybackOwnership(path, "one", path === "/desktop-lyrics").owner).toBeNull();
    }
    expect(resolvePlaybackOwnership("/app", "one", true).runtimeRoomId).toBeNull();
  });
});
