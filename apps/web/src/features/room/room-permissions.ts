import {
  defaultRoomMemberPermissions,
  getRoomMemberPermissions,
  type RoomMemberPermissions,
  type RoomSnapshot
} from "@soqaro/shared";

export type RoomPermission = keyof RoomMemberPermissions;

export function isRoomHost(
  roomSnapshot: Pick<RoomSnapshot, "room"> | null | undefined,
  sessionId: string | null | undefined
) {
  return Boolean(
    roomSnapshot &&
      sessionId &&
      roomSnapshot.room.hostId === sessionId
  );
}

export function getCurrentRoomMemberPermissions(
  roomSnapshot: Pick<RoomSnapshot, "room"> | null | undefined,
  sessionId: string | null | undefined
): RoomMemberPermissions | null {
  if (!roomSnapshot || !sessionId) {
    return null;
  }

  if (isRoomHost(roomSnapshot, sessionId)) {
    return { ...defaultRoomMemberPermissions };
  }

  const member = roomSnapshot.room.members.find((candidate) => candidate.id === sessionId);
  return member ? getRoomMemberPermissions(member) : null;
}

export function hasRoomPermission(
  roomSnapshot: Pick<RoomSnapshot, "room"> | null | undefined,
  sessionId: string | null | undefined,
  permission: RoomPermission
) {
  return getCurrentRoomMemberPermissions(roomSnapshot, sessionId)?.[permission] === true;
}
