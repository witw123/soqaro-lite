"use client";

import {
  deleteCachedLibraryTrackFile,
  linkTrackAssets,
  putAssetManifest,
  releaseAssetUnitsToLocalRepository,
  saveLocalAudioCacheFileRecord,
  saveLocalAudioFileRecord,
  upsertTranscodeJob,
  upsertLocalPlaylistTrack,
  upsertCachedLibraryTrackSummary,
  type CachedLibraryTrackSummaryRecord,
  type TranscodeJobRecord
} from "@/features/library/indexeddb";
import { LocalRepository, type LocalRepositoryTrackRecord } from "./local-repository";
import { resolveProviderTrackSource } from "./provider-track-identity";
import { blobToDataUrl } from "./audio-metadata";

export async function hydrateLocalRepository(repository: LocalRepository) {
  const records = await repository.listTracks();
  let restoredTrackCount = 0;
  let restoredOriginalAssetCount = 0;
  let restoredPlaybackAssetCount = 0;

  for (const record of records) {
    if (
      record.retention === "library" ||
      record.source.kind === "managed" ||
      (record.roomRefs?.length ?? 0) > 0
    ) {
      await restoreTrackSummary(repository, record);
      restoredTrackCount += 1;
    }
    if (record.source.kind === "managed") {
      await deleteCachedLibraryTrackFile(record.fileHash);
      const fileName = record.source.relativePath.split("/").pop() ?? record.fileHash;
      if (record.retention === "library") {
        await saveLocalAudioFileRecord({
          fileHash: record.fileHash,
          sizeBytes: record.sizeBytes,
          fileName,
          relativePath: record.source.relativePath,
          storageKind: "saved"
        });
      } else {
        await saveLocalAudioCacheFileRecord({
          fileHash: record.fileHash,
          fileName,
          relativePath: record.source.relativePath,
          sizeBytes: record.sizeBytes
        });
      }
    } else if (record.retention === "library") {
      await saveLocalAudioFileRecord({
        fileHash: record.fileHash,
        sizeBytes: record.sizeBytes,
        fileName: record.source.relativePath,
        lastModified: record.source.lastModified,
        storageKind: "saved",
        source: "directory-scan"
      });
      await upsertLocalPlaylistTrack({
        id: `local-file:${record.fileHash}`,
        fileHash: record.fileHash,
        fileName: record.source.relativePath,
        lastModified: record.source.lastModified,
        source: "directory-scan",
        title: record.title, artist: record.artist, album: record.album ?? null,
        artworkUrl: record.artworkUrl ?? null, lyrics: record.lyrics ?? null,
        durationMs: record.durationMs, sizeBytes: record.sizeBytes, mimeType: record.mimeType,
        provider: "local_upload", providerTrackId: null, availableOffline: true,
        createdAt: record.createdAt, updatedAt: record.updatedAt
      }, { persistRepository: false });
    }

    if (record.originalAsset) {
      const original = await repository.readOriginalManifest(record.originalAsset.assetId);
      if (original?.manifest.kind === "original") {
        await putAssetManifest(original.manifest, { complete: true });
        await releaseAssetUnitsToLocalRepository(original.manifest.assetId);
        restoredOriginalAssetCount += 1;
      }
    }
    if (record.playbackAsset) {
      const playback = await repository.readPlaybackAsset(
        record.playbackAsset.assetId,
        record.playbackAsset.profileId
      );
      if (playback?.manifest.kind === "playback") {
        await putAssetManifest(playback.manifest, { complete: true });
        await releaseAssetUnitsToLocalRepository(playback.manifest.assetId);
        restoredPlaybackAssetCount += 1;
      }
    }

    for (const roomRef of record.roomRefs ?? []) {
      if (record.originalAsset && record.playbackAsset) {
        await linkTrackAssets({
          trackId: roomRef.trackId,
          originalAssetId: record.originalAsset.assetId,
          playbackAssetId: record.playbackAsset.assetId
        });
      }
    }
  }

  for (const providerTrack of await repository.listProviderTracks<Parameters<typeof upsertLocalPlaylistTrack>[0]>()) {
    await upsertLocalPlaylistTrack(providerTrack, { persistRepository: false });
    if (providerTrack.sourceDirectoryId && providerTrack.fileHash && providerTrack.fileName) {
      await saveLocalAudioFileRecord({
        fileHash: providerTrack.fileHash,
        fileName: providerTrack.fileName,
        sizeBytes: providerTrack.sizeBytes,
        lastModified: providerTrack.lastModified,
        sourceDirectoryId: providerTrack.sourceDirectoryId,
        storageKind: "saved"
      });
    }
  }

  for (const job of await repository.listTranscodeJobs()) {
    await upsertTranscodeJob({
      sourceFileHash: job.sourceFileHash,
      kind: job.kind,
      profileId: job.profileId as TranscodeJobRecord["profileId"],
      status: job.status,
      progress: job.progress,
      errorMessage: job.errorMessage
    }, { persistRepository: false });
  }

  return { restoredTrackCount, restoredOriginalAssetCount, restoredPlaybackAssetCount };
}

async function restoreTrackSummary(
  repository: LocalRepository,
  record: LocalRepositoryTrackRecord
) {
  const localArtworkUrl = record.artworkPath
    ? await readArtworkDataUrl(repository, record.artworkPath)
    : null;
  const artworkUrl = localArtworkUrl ?? record.artworkUrl ?? null;
  const lyrics = record.lyricsPath
    ? await repository.readPath(record.lyricsPath).then((file) => file?.text() ?? null).catch(() => null)
    : null;
  const providerSource = resolveProviderTrackSource(record);
  const cacheProvider = providerSource?.provider ?? (
    record.sourceType === "local_upload" ? "local_upload" : undefined
  );
  const summary: CachedLibraryTrackSummaryRecord = {
    fileHash: record.fileHash,
    title: record.title,
    artist: record.artist,
    ...(record.album !== undefined ? { album: record.album } : {}),
    ...(artworkUrl !== null ? { artworkUrl } : record.artworkUrl !== undefined ? { artworkUrl: record.artworkUrl } : {}),
    ...(record.lyrics !== undefined || lyrics !== null
      ? { lyrics: lyrics ?? record.lyrics ?? null }
      : {}),
    ...(cacheProvider
      ? {
          provider: cacheProvider,
          ...(providerSource ? { providerTrackId: providerSource.trackId } : {})
        }
      : {}),
    mimeType: record.mimeType,
    durationMs: record.durationMs,
    sizeBytes: record.sizeBytes,
    ...(record.loudness ? { loudness: record.loudness } : {}),
    cachedAt: record.updatedAt,
    sourceTrackIds: record.roomRefs?.map((ref) => ref.trackId) ?? [],
    sourceRoomIds: record.roomRefs?.map((ref) => ref.roomId) ?? [],
    lastSourceTrackId: record.roomRefs?.[record.roomRefs.length - 1]?.trackId ?? null,
    lastSourceRoomId: record.roomRefs?.[record.roomRefs.length - 1]?.roomId ?? null,
    lastOwnerNickname: record.roomRefs?.[record.roomRefs.length - 1]?.ownerNickname ?? null
  };
  await upsertCachedLibraryTrackSummary(summary);
}

async function readArtworkDataUrl(repository: LocalRepository, relativePath: string) {
  try {
    const file = await repository.readPath(relativePath);
    return file ? blobToDataUrl(file) : null;
  } catch {
    return null;
  }
}
