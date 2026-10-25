import { describe, expect, it } from "vitest";
import { shouldCommitAwayRoomResume } from "./away-room";

describe("away room resume handoff", () => {
  it("does not commit while the room runtime is background-only", () => {
    expect(shouldCommitAwayRoomResume({
      backgroundOnly: true,
      initialRoomId: "room_1",
      pendingRoomId: "room_1",
      storedResumeRoomId: "room_1"
    })).toBe(false);
  });

  it("commits only after the target room route owns the runtime", () => {
    expect(shouldCommitAwayRoomResume({
      backgroundOnly: false,
      initialRoomId: "room_1",
      pendingRoomId: null,
      storedResumeRoomId: "room_1"
    })).toBe(true);
    expect(shouldCommitAwayRoomResume({
      backgroundOnly: false,
      initialRoomId: "room_2",
      pendingRoomId: "room_1",
      storedResumeRoomId: "room_1"
    })).toBe(false);
  });
});
