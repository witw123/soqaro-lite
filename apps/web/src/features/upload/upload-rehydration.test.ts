import { describe, expect, it } from "vitest";
import {
  applyOwnedUploadRehydrationResult,
  rehydrateOwnedUploadedTracksFromCache
} from "./upload-rehydration";
import type { UploadedTrack } from "@/features/library/audio-utils";

describe("rehydrateOwnedUploadedTracksFromCache", () => {
  const roomTrack = {
    id: "track_1",
    title: "Cached",
    artist: "Artist",
    album: null,
    durationMs: 120_000,
    bitrate: null,
    sizeBytes: 6,
    codec: "flac",
    mimeType: "audio/flac",
    fileHash: "hash_1",
    artworkUrl: null,
    ownerSessionId: "user_1",
    ownerNickname: "Host",
    sourceType: "local_upload" as const
  };

  it("rehydrates missing owned room tracks from usable cached files", async () => {
    const objectUrlFiles: string[] = [];
    const result = await rehydrateOwnedUploadedTracksFromCache({
      missingOwnedTracks: [roomTrack],
      cachedLibraryTracksByHash: new Map(),
      getCachedLibraryTrackSummary: async () => ({
        fileHash: "hash_1",
        title: "Cached",
        artist: "Artist",
        mimeType: "audio/flac",
        durationMs: 120_000,
        sizeBytes: 6,
        cachedAt: "2026-07-06T00:00:00.000Z",
        sourceTrackIds: ["track_1"],
        sourceRoomIds: ["room_1"],
        lastSourceTrackId: "track_1",
        lastSourceRoomId: "room_1",
        lastOwnerNickname: "Host"
      }),
      getCachedLibraryTrack: async () => ({
        fileHash: "hash_1",
        title: "Cached",
        artist: "Artist",
        mimeType: "audio/flac",
        durationMs: 120_000,
        sizeBytes: 6,
        cachedAt: "2026-07-06T00:00:00.000Z",
        sourceTrackIds: ["track_1"],
        sourceRoomIds: ["room_1"],
        lastSourceTrackId: "track_1",
        lastSourceRoomId: "room_1",
        lastOwnerNickname: "Host",
        file: new Blob(["cached"], { type: "audio/flac" })
      }),
      createObjectUrl: (file) => {
        objectUrlFiles.push(file.name);
        return "blob:cached";
      }
    });

    expect(Object.keys(result.uploads)).toEqual(["track_1"]);
    expect(result.uploads.track_1).toMatchObject({
      objectUrl: "blob:cached",
      origin: "live-upload"
    });
    expect(result.createdObjectUrls).toEqual(["blob:cached"]);
    expect(objectUrlFiles).toEqual(["Cached.flac"]);
  });

  it("skips cached files that do not match room track metadata", async () => {
    const result = await rehydrateOwnedUploadedTracksFromCache({
      missingOwnedTracks: [roomTrack],
      cachedLibraryTracksByHash: new Map(),
      getCachedLibraryTrackSummary: async () => ({
        fileHash: "hash_other",
        title: "Cached",
        artist: "Artist",
        mimeType: "audio/flac",
        durationMs: 120_000,
        sizeBytes: 6,
        cachedAt: "2026-07-06T00:00:00.000Z",
        sourceTrackIds: ["track_1"],
        sourceRoomIds: ["room_1"],
        lastSourceTrackId: "track_1",
        lastSourceRoomId: "room_1",
        lastOwnerNickname: "Host"
      }),
      getCachedLibraryTrack: async () => {
        throw new Error("should not load unusable cache records");
      },
      createObjectUrl: () => {
        throw new Error("should not create urls for unusable records");
      }
    });

    expect(result.uploads).toEqual({});
    expect(result.createdObjectUrls).toEqual([]);
  });
});

describe("applyOwnedUploadRehydrationResult", () => {
  const createUpload = (objectUrl: string) => ({
    file: new File(["cached"], "Cached.flac", { type: "audio/flac" }),
    objectUrl,
    origin: "live-upload" as const
  });

  it("revokes created urls when cancelled before applying uploads", () => {
    const revokedUrls: string[] = [];
    let state: Record<string, UploadedTrack> = {};

    const applied = applyOwnedUploadRehydrationResult({
      cancelled: true,
      result: {
        uploads: {
          track_1: createUpload("blob:track-1")
        },
        createdObjectUrls: ["blob:track-1"]
      },
      setUploadedTracks: (updater) => {
        state = updater(state);
      },
      revokeObjectUrl: (objectUrl) => revokedUrls.push(objectUrl)
    });

    expect(applied).toBe(false);
    expect(state).toEqual({});
    expect(revokedUrls).toEqual(["blob:track-1"]);
  });

  it("merges new uploads and revokes duplicates without replacing unchanged state", () => {
    const existingUpload = createUpload("blob:existing");
    const duplicateUpload = createUpload("blob:duplicate");
    const newUpload = createUpload("blob:new");
    const revokedUrls: string[] = [];
    const firstState = {
      track_existing: existingUpload
    };
    let state: Record<string, UploadedTrack> = firstState;

    const applied = applyOwnedUploadRehydrationResult({
      cancelled: false,
      result: {
        uploads: {
          track_existing: duplicateUpload,
          track_new: newUpload
        },
        createdObjectUrls: ["blob:duplicate", "blob:new"]
      },
      setUploadedTracks: (updater) => {
        state = updater(state);
      },
      revokeObjectUrl: (objectUrl) => revokedUrls.push(objectUrl)
    });

    expect(applied).toBe(true);
    expect(state).toEqual({
      track_existing: existingUpload,
      track_new: newUpload
    });
    expect(revokedUrls).toEqual(["blob:duplicate"]);

    const unchangedState = {
      track_existing: existingUpload
    };
    state = unchangedState;
    const duplicateOnlyApplied = applyOwnedUploadRehydrationResult({
      cancelled: false,
      result: {
        uploads: {
          track_existing: duplicateUpload
        },
        createdObjectUrls: ["blob:duplicate"]
      },
      setUploadedTracks: (updater) => {
        state = updater(state);
      },
      revokeObjectUrl: (objectUrl) => revokedUrls.push(objectUrl)
    });

    expect(duplicateOnlyApplied).toBe(true);
    expect(state).toBe(unchangedState);
  });
});
