"use client";

import type { RoomDirectoryItem } from "@soqaro/shared";

export function filterOpenPublicRooms(rooms: RoomDirectoryItem[]) {
  return rooms.filter((room) => room.room.visibility === "public");
}

export function filterRoomsForSession(rooms: RoomDirectoryItem[], _sessionId?: string | null) {
  return rooms;
}
