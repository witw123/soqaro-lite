export function buildRoomHref(roomId: string): string {
  return `/room?id=${encodeURIComponent(roomId)}`;
}
