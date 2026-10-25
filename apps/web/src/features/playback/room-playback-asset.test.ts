import type { RoomSnapshot, TrackMeta } from "@soqaro/shared";
import { describe, expect, it } from "vitest";
import {
  resolveCurrentRoomPlaybackAsset,
  resolveRoomTrackPlaybackAsset
} from "./room-playback-asset";

const asset = (assetId: string) => ({ assetId } as TrackMeta["playbackAsset"]);

function createSnapshot(input: {
  currentTrackId: string | null;
  playbackAssetId?: string | null;
  tracks?: Array<{ id: string; playbackAsset?: TrackMeta["playbackAsset"] }>;
}) {
  return {
    room: {
      playback: {
        currentTrackId: input.currentTrackId,
        playbackAssetId: input.playbackAssetId
      }
    },
    tracks: input.tracks ?? [{ id: "track-1", playbackAsset: asset("asset-room") }]
  } as unknown as RoomSnapshot;
}

describe("room playback asset resolution", () => {
  it("uses the room catalog asset instead of a stale current-track manifest", () => {
    const snapshot = createSnapshot({
      currentTrackId: "track-1",
      playbackAssetId: "asset-room"
    });
    const currentTrack = {
      id: "track-1",
      playbackAsset: asset("asset-stale")
    } as TrackMeta;

    expect(resolveCurrentRoomPlaybackAsset(snapshot, currentTrack)?.assetId).toBe("asset-room");
  });

  it("rejects a catalog asset that does not match the room playback asset id", () => {
    const snapshot = createSnapshot({
      currentTrackId: "track-1",
      playbackAssetId: "asset-authoritative"
    });

    expect(resolveCurrentRoomPlaybackAsset(snapshot, { id: "track-1" } as TrackMeta)).toBeNull();
  });

  it("rejects an active room track when playbackAssetId is missing", () => {
    const snapshot = createSnapshot({
      currentTrackId: "track-1",
      playbackAssetId: null
    });

    expect(resolveCurrentRoomPlaybackAsset(snapshot, { id: "track-1" } as TrackMeta)).toBeNull();
  });

  it("validates gapless assets against the transition asset id", () => {
    const snapshot = createSnapshot({
      currentTrackId: "track-1",
      playbackAssetId: "asset-current",
      tracks: [{ id: "track-next", playbackAsset: asset("asset-next") }]
    });

    expect(resolveRoomTrackPlaybackAsset(snapshot, "track-next", "asset-next")?.assetId).toBe("asset-next");
    expect(resolveRoomTrackPlaybackAsset(snapshot, "track-next", "asset-stale")).toBeNull();
  });
});
