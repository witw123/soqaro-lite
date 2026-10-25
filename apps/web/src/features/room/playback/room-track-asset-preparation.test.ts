import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrackMeta } from "@soqaro/shared";
import {
  ensureRoomTrackDistributionAsset,
  getTrackAssetPreparationState,
  resolveTrackAudioFile,
  verifyPlaybackAssetIntegrity,
  prepareTrackWithLocalFile,
  getTrackUnavailableReason,
  setTrackUnavailableReason
} from "./room-track-asset-preparation";
import { getRoomLocalAudioFile, hasDirectoryReadPermission } from "@/features/library/local-audio-storage";
import {
  getCachedLibraryTrack,
  getCachedLibraryTrackByProviderTrack,
  getAssetManifest,
  getLocalAudioDirectory,
  linkTrackAssets,
  soqaroDatabase
} from "@/features/library/indexeddb";
import { prepareAudioAssets } from "@/features/library/audio-asset-builder";
import { soqaroApi } from "@/lib/network/soqaro-api";

vi.mock("@/features/library/local-audio-storage", () => ({
  getRoomLocalAudioFile: vi.fn().mockResolvedValue(null),
  hasDirectoryReadPermission: vi.fn().mockResolvedValue(true)
}));

vi.mock("@/features/library/indexeddb", () => ({
  getCachedLibraryTrack: vi.fn().mockResolvedValue(undefined),
  getCachedLibraryTrackByProviderTrack: vi.fn().mockResolvedValue(undefined),
  getAssetManifest: vi.fn().mockResolvedValue(undefined),
  getLocalAudioDirectory: vi.fn().mockResolvedValue(undefined),
  linkTrackAssets: vi.fn().mockResolvedValue(undefined),
  soqaroDatabase: {
    assetUnits: {
      where: vi.fn()
    }
  }
}));

vi.mock("@/features/library/audio-asset-builder", () => ({
  prepareAudioAssets: vi.fn()
}));

vi.mock("@/lib/network/soqaro-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/network/soqaro-api")>();
  return {
    ...actual,
    soqaroApi: {
      ...actual.soqaroApi,
      downloadNeteaseTrack: vi.fn(),
      downloadQqMusicTrack: vi.fn(),
      downloadBilibiliTrack: vi.fn(),
      prepareTrackAsset: vi.fn(),
      reportTrackAssetUnavailable: vi.fn().mockResolvedValue({ success: true })
    }
  };
});

vi.mock("@/features/settings/settings-store", () => ({
  getAppSettings: () => ({
    playback: {
      preferredAudioQuality: "exhigh"
    }
  })
}));

describe("room-track-asset-preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseTrack: TrackMeta = {
    id: "track_1",
    title: "Test Song",
    artist: "Test Artist",
    album: "Test Album",
    durationMs: 180000,
    bitrate: 320000,
    sizeBytes: 5000000,
    fileHash: "hash-without-assets",
    artworkUrl: null,
    ownerSessionId: "session_user",
    ownerNickname: "User",
    sourceType: "netease",
    sourceRef: { provider: "netease", trackId: "12345" }
  };

  it("resolves local file first when available", async () => {
    const mockFile = new File(["audio"], "test.mp3", { type: "audio/mpeg" });
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(mockFile as never);

    const file = await resolveTrackAudioFile(baseTrack);
    expect(file).toBe(mockFile);
    expect(getRoomLocalAudioFile).toHaveBeenCalled();
    expect(getCachedLibraryTrackByProviderTrack).not.toHaveBeenCalled();
    expect(soqaroApi.downloadNeteaseTrack).not.toHaveBeenCalled();
  });

  it("falls back to indexeddb cache when local directory file is absent", async () => {
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(null);
    const mockBlob = new Blob(["audio-data"], { type: "audio/mpeg" });
    vi.mocked(getCachedLibraryTrackByProviderTrack).mockResolvedValue({
      file: mockBlob,
      mimeType: "audio/mpeg",
      fileHash: "cached-hash",
      title: "Test Song"
    } as never);

    const file = await resolveTrackAudioFile(baseTrack);
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe("audio/mpeg");
    expect(soqaroApi.downloadNeteaseTrack).not.toHaveBeenCalled();
  });

  it("falls back to provider download when neither local nor cache exists", async () => {
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(null);
    vi.mocked(getCachedLibraryTrackByProviderTrack).mockResolvedValue(undefined);
    vi.mocked(getCachedLibraryTrack).mockResolvedValue(undefined);

    const downloadBlob = new Blob(["downloaded-audio"], { type: "audio/mpeg" });
    vi.mocked(soqaroApi.downloadNeteaseTrack).mockResolvedValue({
      blob: downloadBlob,
      contentType: "audio/mpeg"
    } as never);

    const file = await resolveTrackAudioFile(baseTrack);
    expect(file).toBeInstanceOf(File);
    expect(soqaroApi.downloadNeteaseTrack).toHaveBeenCalledWith("12345", "exhigh", undefined);
  });

  it("returns immediately when track already has complete room assets", async () => {
    vi.mocked(getAssetManifest).mockResolvedValue({
      complete: true,
      manifest: { unitCount: 90 }
    } as never);

    const completeTrack: TrackMeta = {
      ...baseTrack,
      originalAsset: {
        assetId: "1".repeat(64),
        kind: "original",
        fileHash: "2".repeat(64),
        mimeType: "audio/mp3",
        sizeBytes: 1000,
        unitSize: 1048576,
        unitCount: 1,
        merkleRoot: "3".repeat(64)
      },
      playbackAsset: {
        assetId: "4".repeat(64),
        kind: "playback",
        sourceFileHash: "2".repeat(64),
        profileId: "opus-music-v4",
        codec: "opus",
        container: "audio/ogg",
        sampleRate: 48000,
        channels: 2,
        bitrate: 256000,
        durationMs: 180000,
        segmentDurationMs: 2000,
        seekPrerollMs: 80,
        unitCount: 90,
        merkleRoot: "5".repeat(64),
        encoder: { name: "@audio/opus-encode", version: "3.4.0" }
      }
    };

    const result = await ensureRoomTrackDistributionAsset("room_1", completeTrack);
    expect(result).toBe(completeTrack);
    expect(getTrackAssetPreparationState(completeTrack.id)).toBe("ready");
    expect(prepareAudioAssets).not.toHaveBeenCalled();
  });

  it("reports asset-corrupt when complete asset fails integrity verification", async () => {
    vi.mocked(getAssetManifest).mockResolvedValue(null as never);

    const corruptTrack: TrackMeta = {
      ...baseTrack,
      id: "track_corrupt",
      originalAsset: {
        assetId: "1".repeat(64),
        kind: "original",
        fileHash: "2".repeat(64),
        mimeType: "audio/mp3",
        sizeBytes: 1000,
        unitSize: 1048576,
        unitCount: 1,
        merkleRoot: "3".repeat(64)
      },
      playbackAsset: {
        assetId: "4".repeat(64),
        kind: "playback",
        sourceFileHash: "2".repeat(64),
        profileId: "opus-music-v4",
        codec: "opus",
        container: "audio/ogg",
        sampleRate: 48000,
        channels: 2,
        bitrate: 256000,
        durationMs: 180000,
        segmentDurationMs: 2000,
        seekPrerollMs: 80,
        unitCount: 90,
        merkleRoot: "5".repeat(64),
        encoder: { name: "@audio/opus-encode", version: "3.4.0" }
      }
    };

    const result = await ensureRoomTrackDistributionAsset("room_1", corruptTrack);
    expect(result).toBeNull();
    expect(getTrackAssetPreparationState("track_corrupt")).toBe("failed");
    expect(getTrackUnavailableReason("track_corrupt")).toBe("asset-corrupt");
    expect(soqaroApi.reportTrackAssetUnavailable).toHaveBeenCalledWith("room_1", "track_corrupt", {
      trackId: "track_corrupt",
      reason: "asset-corrupt"
    });
  });

  it("transcodes and registers asset with server when missing", async () => {
    const mockFile = new File(["audio"], "song.mp3", { type: "audio/mpeg" });
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(mockFile as never);

    const mockPreparedAssets = {
      fileHash: "real-sha256-hash",
      originalAsset: { assetId: "orig-1" } as never,
      playbackAsset: { assetId: "play-1" } as never,
      loudness: { integratedLufs: -14 }
    };
    vi.mocked(prepareAudioAssets).mockResolvedValue(mockPreparedAssets as never);

    const updatedServerTrack: TrackMeta = {
      ...baseTrack,
      fileHash: "real-sha256-hash",
      originalAsset: mockPreparedAssets.originalAsset,
      playbackAsset: mockPreparedAssets.playbackAsset
    };
    vi.mocked(soqaroApi.prepareTrackAsset).mockResolvedValue(updatedServerTrack);

    const result = await ensureRoomTrackDistributionAsset("room_1", baseTrack);

    expect(prepareAudioAssets).toHaveBeenCalledWith({ file: mockFile, signal: undefined });
    expect(soqaroApi.prepareTrackAsset).toHaveBeenCalledWith("room_1", "track_1", {
      trackId: "track_1",
      fileHash: "real-sha256-hash",
      originalAsset: mockPreparedAssets.originalAsset,
      playbackAsset: mockPreparedAssets.playbackAsset
    });
    expect(linkTrackAssets).toHaveBeenCalledWith({
      trackId: "track_1",
      originalAssetId: "orig-1",
      playbackAssetId: "play-1"
    });
    expect(result).toEqual(updatedServerTrack);
    expect(getTrackAssetPreparationState("track_1")).toBe("ready");
  });

  it("sets state to source-missing and reports unavailable when no audio source can be resolved", async () => {
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(null);
    vi.mocked(getCachedLibraryTrackByProviderTrack).mockResolvedValue(undefined);
    vi.mocked(getCachedLibraryTrack).mockResolvedValue(undefined);
    vi.mocked(soqaroApi.downloadNeteaseTrack).mockResolvedValue(null as never);

    const result = await ensureRoomTrackDistributionAsset("room_1", baseTrack);
    expect(result).toBeNull();
    expect(getTrackAssetPreparationState("track_1")).toBe("source-missing");
    expect(getTrackUnavailableReason("track_1")).toBe("source-missing");
    expect(soqaroApi.reportTrackAssetUnavailable).toHaveBeenCalledWith("room_1", "track_1", {
      trackId: "track_1",
      reason: "source-missing"
    });
  });

  it("reports permission-denied when local upload directory read permission is missing", async () => {
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(null);
    vi.mocked(getLocalAudioDirectory).mockResolvedValue({ handle: {} as FileSystemDirectoryHandle } as never);
    vi.mocked(hasDirectoryReadPermission).mockResolvedValue(false);

    const localTrack: TrackMeta = {
      ...baseTrack,
      id: "track_perm_missing",
      sourceType: "local_upload"
    };

    const result = await ensureRoomTrackDistributionAsset("room_1", localTrack);
    expect(result).toBeNull();
    expect(getTrackAssetPreparationState("track_perm_missing")).toBe("failed");
    expect(getTrackUnavailableReason("track_perm_missing")).toBe("permission-denied");
    expect(soqaroApi.reportTrackAssetUnavailable).toHaveBeenCalledWith("room_1", "track_perm_missing", {
      trackId: "track_perm_missing",
      reason: "permission-denied"
    });
  });

  it("reports permission-denied when transcoding throws NotAllowedError", async () => {
    const mockFile = new File(["audio"], "test.mp3", { type: "audio/mpeg" });
    vi.mocked(getRoomLocalAudioFile).mockResolvedValue(mockFile as never);
    const permError = new DOMException("The user denied permission", "NotAllowedError");
    vi.mocked(prepareAudioAssets).mockRejectedValue(permError);

    const track: TrackMeta = {
      ...baseTrack,
      id: "track_transcode_perm"
    };

    await expect(ensureRoomTrackDistributionAsset("room_1", track)).rejects.toThrow("The user denied permission");
    expect(getTrackAssetPreparationState("track_transcode_perm")).toBe("failed");
    expect(getTrackUnavailableReason("track_transcode_perm")).toBe("permission-denied");
    expect(soqaroApi.reportTrackAssetUnavailable).toHaveBeenCalledWith("room_1", "track_transcode_perm", {
      trackId: "track_transcode_perm",
      reason: "permission-denied"
    });
  });

  describe("verifyPlaybackAssetIntegrity", () => {
    it("returns false for null or undefined assetId", async () => {
      expect(await verifyPlaybackAssetIntegrity(null)).toBe(false);
      expect(await verifyPlaybackAssetIntegrity(undefined)).toBe(false);
    });

    it("returns true when manifest record is complete", async () => {
      vi.mocked(getAssetManifest).mockResolvedValue({
        complete: true,
        manifest: { unitCount: 10 }
      } as never);
      expect(await verifyPlaybackAssetIntegrity("asset-123")).toBe(true);
    });

    it("returns true when unitCount matches indexeddb units", async () => {
      vi.mocked(getAssetManifest).mockResolvedValue({
        complete: false,
        manifest: { unitCount: 5 }
      } as never);
      const mockCount = vi.fn().mockResolvedValue(5);
      const mockEquals = vi.fn().mockReturnValue({ count: mockCount });
      vi.mocked(soqaroDatabase.assetUnits.where).mockReturnValue({ equals: mockEquals } as never);

      expect(await verifyPlaybackAssetIntegrity("asset-123")).toBe(true);
    });

    it("returns false when unitCount in indexeddb is insufficient", async () => {
      vi.mocked(getAssetManifest).mockResolvedValue({
        complete: false,
        manifest: { unitCount: 5 }
      } as never);
      const mockCount = vi.fn().mockResolvedValue(3);
      const mockEquals = vi.fn().mockReturnValue({ count: mockCount });
      vi.mocked(soqaroDatabase.assetUnits.where).mockReturnValue({ equals: mockEquals } as never);

      expect(await verifyPlaybackAssetIntegrity("asset-123")).toBe(false);
    });

    it("returns false when manifest is missing or indexeddb throws", async () => {
      vi.mocked(getAssetManifest).mockResolvedValue(null as never);
      expect(await verifyPlaybackAssetIntegrity("asset-123")).toBe(false);

      vi.mocked(getAssetManifest).mockRejectedValue(new Error("DB error"));
      expect(await verifyPlaybackAssetIntegrity("asset-123")).toBe(false);
    });
  });

  describe("prepareTrackWithLocalFile", () => {
    it("transcodes and recovers track with provided file", async () => {
      const mockFile = new File(["recovered-audio"], "manual.mp3", { type: "audio/mpeg" });
      const mockPreparedAssets = {
        fileHash: "new-recovered-hash",
        originalAsset: { assetId: "orig-manual" } as never,
        playbackAsset: { assetId: "play-manual" } as never
      };
      vi.mocked(prepareAudioAssets).mockResolvedValue(mockPreparedAssets as never);

      const recoveredTrack: TrackMeta = {
        ...baseTrack,
        id: "track_recover",
        fileHash: "new-recovered-hash",
        originalAsset: mockPreparedAssets.originalAsset,
        playbackAsset: mockPreparedAssets.playbackAsset
      };
      vi.mocked(soqaroApi.prepareTrackAsset).mockResolvedValue(recoveredTrack);

      const trackToRecover: TrackMeta = { ...baseTrack, id: "track_recover" };
      setTrackUnavailableReason("track_recover", "source-missing");

      const result = await prepareTrackWithLocalFile("room_1", trackToRecover, mockFile);

      expect(prepareAudioAssets).toHaveBeenCalledWith({ file: mockFile, signal: undefined });
      expect(soqaroApi.prepareTrackAsset).toHaveBeenCalledWith("room_1", "track_recover", {
        trackId: "track_recover",
        fileHash: "new-recovered-hash",
        originalAsset: mockPreparedAssets.originalAsset,
        playbackAsset: mockPreparedAssets.playbackAsset
      });
      expect(linkTrackAssets).toHaveBeenCalledWith({
        trackId: "track_recover",
        originalAssetId: "orig-manual",
        playbackAssetId: "play-manual"
      });
      expect(result).toEqual(recoveredTrack);
      expect(getTrackAssetPreparationState("track_recover")).toBe("ready");
      expect(getTrackUnavailableReason("track_recover")).toBeNull();
    });

    it("marks state as failed and sets reason asset-corrupt on failure", async () => {
      const mockFile = new File(["bad"], "bad.mp3", { type: "audio/mpeg" });
      vi.mocked(prepareAudioAssets).mockRejectedValue(new Error("Transcode failed"));

      const trackToRecover: TrackMeta = { ...baseTrack, id: "track_fail_manual" };

      await expect(prepareTrackWithLocalFile("room_1", trackToRecover, mockFile)).rejects.toThrow("Transcode failed");
      expect(getTrackAssetPreparationState("track_fail_manual")).toBe("failed");
      expect(getTrackUnavailableReason("track_fail_manual")).toBe("asset-corrupt");
    });
  });
});
