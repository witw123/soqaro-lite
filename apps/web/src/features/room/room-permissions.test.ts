import { describe, expect, it } from "vitest";
import {
  getCurrentRoomMemberPermissions,
  hasRoomPermission,
  isRoomHost
} from "./room-permissions";

function createRoomSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    room: {
      hostId: "host",
      members: [
        {
          id: "host",
          role: "host",
          permissions: { library: false, queue: false, player: false }
        },
        {
          id: "member",
          role: "member",
          permissions: { library: false, queue: true, player: false }
        }
      ],
      ...overrides
    }
  } as never;
}

describe("room permission resolution", () => {
  it("gives the host all permissions even when stale member data is present", () => {
    const snapshot = createRoomSnapshot();

    expect(isRoomHost(snapshot, "host")).toBe(true);
    expect(getCurrentRoomMemberPermissions(snapshot, "host")).toEqual({
      library: true,
      queue: true,
      player: true
    });
  });

  it("reads each permission independently for a member", () => {
    const snapshot = createRoomSnapshot();

    expect(hasRoomPermission(snapshot, "member", "library")).toBe(false);
    expect(hasRoomPermission(snapshot, "member", "queue")).toBe(true);
    expect(hasRoomPermission(snapshot, "member", "player")).toBe(false);
  });

  it("does not grant access before the session is a room member", () => {
    const snapshot = createRoomSnapshot();

    expect(getCurrentRoomMemberPermissions(snapshot, "unknown")).toBeNull();
    expect(hasRoomPermission(snapshot, "unknown", "queue")).toBe(false);
    expect(isRoomHost(snapshot, "unknown")).toBe(false);
  });
});
