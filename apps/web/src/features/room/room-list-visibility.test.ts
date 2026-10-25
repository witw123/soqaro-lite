import { describe, expect, it } from "vitest";
import type { RoomDirectoryItem } from "@soqaro/shared";
import { filterOpenPublicRooms, filterRoomsForSession } from "./room-list-visibility";

function createRoomDirectoryItem(input: {
  id: string;
  isMember: boolean;
  visibility: "public" | "private";
}): RoomDirectoryItem {
  return {
    room: {
      id: input.id,
      joinCode: input.id.slice(0, 6).toUpperCase(),
      name: input.id,
      description: null,
      hasPassword: false,
      visibility: input.visibility,
      roomType: "interactive",
      directoryHostNickname: "Host",
      directoryMemberCount: 2,
      directoryOnlineMemberCount: 1,
      directoryIsMember: input.isMember,
      directoryQueueDepth: 0,
      directoryPendingRequestCount: 0,
      directoryBroadcastState: null,
      directoryNowPlaying: null,
      playbackStatus: "paused"
    }
  };
}

describe("filterOpenPublicRooms", () => {
  it("keeps every public room regardless of member presence", () => {
    const rooms = [
      createRoomDirectoryItem({
        id: "room_public_online",
        isMember: false,
        visibility: "public",
      }),
      createRoomDirectoryItem({
        id: "room_public_offline",
        isMember: false,
        visibility: "public",
      }),
      createRoomDirectoryItem({
        id: "room_private_online",
        isMember: false,
        visibility: "private",
      })
    ];

    expect(filterOpenPublicRooms(rooms).map((room) => room.room.id)).toEqual([
      "room_public_online",
      "room_public_offline"
    ]);
  });
});

describe("filterRoomsForSession", () => {
  it("keeps the current user's rooms and every public room", () => {
    const rooms = [
      createRoomDirectoryItem({
        id: "room_owned_private",
        isMember: true,
        visibility: "private",
      }),
      createRoomDirectoryItem({
        id: "room_owned_public",
        isMember: true,
        visibility: "public",
      }),
      createRoomDirectoryItem({
        id: "room_other_public_online",
        isMember: false,
        visibility: "public",
      }),
      createRoomDirectoryItem({
        id: "room_other_public_offline",
        isMember: false,
        visibility: "public",
      })
    ];

    expect(filterRoomsForSession(rooms, "session_current").map((room) => room.room.id)).toEqual([
      "room_owned_private",
      "room_owned_public",
      "room_other_public_online",
      "room_other_public_offline"
    ]);
  });
});
