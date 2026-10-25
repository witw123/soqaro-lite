import type { RoomType } from "@soqaro/shared";

export type RoomPlaybackStrategy = {
  cache: "shared-library-and-provider";
  stream: "segmented-opus-with-rtp-fallback";
  readiness: "room-wide-cache-barrier";
};

const sharedRoomPlaybackStrategy: RoomPlaybackStrategy = {
  cache: "shared-library-and-provider",
  stream: "segmented-opus-with-rtp-fallback",
  readiness: "room-wide-cache-barrier"
};

/** All room formats use the same media pipeline; only playback permissions differ. */
export function resolveRoomPlaybackStrategy(
  _roomType: RoomType | null | undefined
): RoomPlaybackStrategy {
  return sharedRoomPlaybackStrategy;
}
