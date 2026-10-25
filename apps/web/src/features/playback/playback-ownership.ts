export type PlaybackOwner = "local" | "room" | null;

export function resolvePlaybackOwnership(
  pathname: string | null,
  awayRoomId: string | null,
  isLyricsWindow: boolean,
  searchParams?: { get: (key: string) => string | null } | null
) {
  let routeRoomId: string | null = null;
  if (!isLyricsWindow && pathname) {
    const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
    if (roomMatch) {
      try {
        routeRoomId = decodeURIComponent(roomMatch[1]);
      } catch {
        routeRoomId = roomMatch[1];
      }
    } else if (pathname === "/room") {
      if (searchParams) {
        routeRoomId = searchParams.get("id") || searchParams.get("roomId") || null;
      } else if (typeof window !== "undefined") {
        const query = new URLSearchParams(window.location.search);
        routeRoomId = query.get("id") || query.get("roomId") || null;
      }
    }
  }
  const isWorkspace =
    pathname === "/" ||
    pathname === "/room" ||
    pathname === "/rooms" ||
    /^\/app(?:\/|$)/.test(pathname ?? "");
  const runtimeRoomId = isLyricsWindow
    ? null
    : routeRoomId ?? (isWorkspace ? awayRoomId : null);
  const owner: PlaybackOwner = isLyricsWindow
    ? null
    : runtimeRoomId ? "room" : isWorkspace ? "local" : null;
  return { owner, routeRoomId, runtimeRoomId };
}
