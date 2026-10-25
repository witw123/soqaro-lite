import type { TrackMeta } from "@soqaro/shared";
import type { CachedLibraryTrack } from "./audio-utils";

type CachedLibraryTrackIdentity = Pick<
  CachedLibraryTrack,
  "fileHash" | "sourceTrackIds" | "lastSourceTrackId" | "durationMs" | "sizeBytes"
>;

type RoomTrackIdentity = Pick<TrackMeta, "id" | "fileHash"> &
  Partial<Pick<TrackMeta, "durationMs" | "sizeBytes">>;

export function isCachedLibraryTrackUsableForRoomTrack(input: {
  cachedTrack: CachedLibraryTrackIdentity | null | undefined;
  roomTrack: RoomTrackIdentity | null | undefined;
}) {
  const { cachedTrack, roomTrack } = input;
  if (!cachedTrack || !roomTrack || cachedTrack.fileHash !== roomTrack.fileHash) {
    return false;
  }

  const sourceTrackIds = cachedTrack.sourceTrackIds ?? [];
  const hasCurrentTrackProvenance =
    cachedTrack.lastSourceTrackId === roomTrack.id || sourceTrackIds.includes(roomTrack.id);
  if (hasCurrentTrackProvenance) {
    return true;
  }

  const hasSizeMatch =
    typeof roomTrack.sizeBytes === "number" &&
    roomTrack.sizeBytes > 0 &&
    cachedTrack.sizeBytes === roomTrack.sizeBytes;
  const durationMs = roomTrack.durationMs;
  const hasDurationMatch =
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    Math.abs(cachedTrack.durationMs - durationMs) <= 1_000;

  return hasSizeMatch && hasDurationMatch;
}
