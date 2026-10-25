export type PlaybackOwner = "local" | "room" | null;

export function resolvePlaybackOwnership(
  pathname: string | null,
  awayRoomId: string | null,
  isLyricsWindow: boolean
) {
  const roomMatch = pathname?.match(/^\/room\/([^/]+)$/);
  let routeRoomId: string | null = null;
  if (roomMatch && !isLyricsWindow) {
    try {
      routeRoomId = decodeURIComponent(roomMatch[1]);
    } catch {
      routeRoomId = roomMatch[1];
    }
  }
  const isWorkspace = pathname === "/rooms" || /^\/app(?:\/|$)/.test(pathname ?? "");
  const runtimeRoomId = isLyricsWindow
    ? null
    : routeRoomId ?? (isWorkspace ? awayRoomId : null);
  const owner: PlaybackOwner = isLyricsWindow
    ? null
    : runtimeRoomId ? "room" : isWorkspace ? "local" : null;
  return { owner, routeRoomId, runtimeRoomId };
}
