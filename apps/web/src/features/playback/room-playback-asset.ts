import type { RoomSnapshot, TrackMeta } from "@soqaro/shared";

/**
 * Resolve the playback asset declared by the current room timeline.
 *
 * The track metadata is the manifest carrier, while playbackAssetId on the
 * room snapshot is the authoritative selection. Refuse mismatched manifests
 * so a stale library snapshot cannot make the source decode the wrong asset.
 */
export function resolveRoomTrackPlaybackAsset(
  roomSnapshot: RoomSnapshot | null | undefined,
  trackId: string | null | undefined,
  expectedAssetId?: string | null
): TrackMeta["playbackAsset"] | null {
  if (!roomSnapshot || !trackId) {
    return null;
  }

  const track = roomSnapshot.tracks.find((item) => item.id === trackId);
  const asset = track?.playbackAsset;
  if (!asset) {
    return null;
  }

  const isCurrentRoomTrack = roomSnapshot.room.playback.currentTrackId === trackId;
  const hasExplicitExpectedAssetId = expectedAssetId !== undefined;
  const authoritativeAssetId = hasExplicitExpectedAssetId
    ? expectedAssetId
    : (
      roomSnapshot.room.playback.currentTrackId === trackId
        ? roomSnapshot.room.playback.playbackAssetId
        : null
    );
  if ((isCurrentRoomTrack || hasExplicitExpectedAssetId) && (
    !authoritativeAssetId || asset.assetId !== authoritativeAssetId
  )) {
    return null;
  }

  return asset;
}

export function resolveCurrentRoomPlaybackAsset(
  roomSnapshot: RoomSnapshot | null | undefined,
  currentTrack: TrackMeta | null | undefined
) {
  if (
    !roomSnapshot ||
    !currentTrack ||
    roomSnapshot.room.playback.currentTrackId !== currentTrack.id
  ) {
    return null;
  }

  return resolveRoomTrackPlaybackAsset(
    roomSnapshot,
    currentTrack.id,
    roomSnapshot.room.playback.playbackAssetId
  );
}
