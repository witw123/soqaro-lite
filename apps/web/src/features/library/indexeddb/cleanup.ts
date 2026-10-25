import {
  backfillCachedLibraryTrackMetadataIfNeeded,
  removeCachedLibrarySourceReferences,
  toCachedLibraryTrackSummaryRecord
} from "./cached-library";
import {
  soqaroDatabase,
  type AudioAssetManifestRecord
} from "./database";
import { LocalRepository } from "../local-repository";
import { getLocalAudioDirectory } from "./storage-records";

export async function deleteLocalTrackDataForTracks(
  trackIds: readonly string[],
  options?: { roomId?: string }
) {
  const uniqueTrackIds = [...new Set(trackIds.filter(Boolean))];
  if (uniqueTrackIds.length === 0) {
    return;
  }

  const deletedLocalFileHashes = new Set<string>();
  const deletedLocalAssetManifests = new Map<string, AudioAssetManifestRecord>();

  await soqaroDatabase.transaction(
    "rw",
    [
      soqaroDatabase.cachedTrackLibrary,
      soqaroDatabase.cachedTrackLibraryMetadata,
      soqaroDatabase.trackAssetLinks,
      soqaroDatabase.assetManifests,
      soqaroDatabase.assetUnits,
      soqaroDatabase.transcodeJobs
    ],
    async () => {
      const cachedSummaryKeys = await soqaroDatabase.cachedTrackLibraryMetadata
        .where("sourceTrackIds")
        .anyOf(uniqueTrackIds)
        .primaryKeys();
      const cachedRecordKeys = await soqaroDatabase.cachedTrackLibrary
        .where("sourceTrackIds")
        .anyOf(uniqueTrackIds)
        .primaryKeys();
      const fileHashes = [
        ...new Set(
          [...cachedSummaryKeys, ...cachedRecordKeys].filter(
            (key): key is string => typeof key === "string"
          )
        )
      ];
      for (const fileHash of fileHashes) {
        const record = await soqaroDatabase.cachedTrackLibrary.get(fileHash);
        const summary = await soqaroDatabase.cachedTrackLibraryMetadata.get(fileHash);
        const source = record ?? summary;
        if (!source) {
          continue;
        }

        const nextReferences = removeCachedLibrarySourceReferences(
          source,
          uniqueTrackIds,
          options?.roomId
        );

        if (record) {
          await soqaroDatabase.cachedTrackLibrary.put({ ...record, ...nextReferences });
        }
        const nextSummary = summary ?? (record ? toCachedLibraryTrackSummaryRecord(record) : null);
        if (nextSummary) {
          await soqaroDatabase.cachedTrackLibraryMetadata.put({
            ...nextSummary,
            ...nextReferences
          });
        }
      }

      const removedLinks = await soqaroDatabase.trackAssetLinks
        .where("trackId")
        .anyOf(uniqueTrackIds)
        .toArray();
      const remainingLinks = await soqaroDatabase.trackAssetLinks
        .filter((link) => !uniqueTrackIds.includes(link.trackId))
        .toArray();
      const remainingAssetIds = new Set(
        remainingLinks.flatMap((link) => [link.originalAssetId, link.playbackAssetId])
      );
      const removableAssetIds = [
        ...new Set(
          removedLinks.flatMap((link) => [link.originalAssetId, link.playbackAssetId])
        )
      ].filter((assetId) => !remainingAssetIds.has(assetId));
      const removableManifests = await soqaroDatabase.assetManifests.bulkGet(removableAssetIds);
      for (const manifest of removableManifests) {
        if (manifest) deletedLocalAssetManifests.set(manifest.assetId, manifest);
      }
      const removableSourceFileHashes = new Set(
        removableManifests
          .filter((manifest): manifest is AudioAssetManifestRecord => !!manifest)
          .map((manifest) => manifest.sourceFileHash)
      );

      await soqaroDatabase.trackAssetLinks.bulkDelete(uniqueTrackIds);
      if (removableAssetIds.length > 0) {
        await soqaroDatabase.assetUnits.where("assetId").anyOf(removableAssetIds).delete();
        await soqaroDatabase.assetManifests.bulkDelete(removableAssetIds);
      }

      if (removableSourceFileHashes.size > 0) {
        const remainingCachedHashes = new Set(
          (await soqaroDatabase.cachedTrackLibraryMetadata.toCollection().primaryKeys())
            .filter((key): key is string => typeof key === "string")
        );
        const remainingAssetSourceFileHashes = new Set(
          (await soqaroDatabase.assetManifests.toArray()).map((manifest) => manifest.sourceFileHash)
        );
        const sourceFileHashesToDelete = [...removableSourceFileHashes].filter(
          (fileHash) =>
            !remainingCachedHashes.has(fileHash) && !remainingAssetSourceFileHashes.has(fileHash)
        );
        if (sourceFileHashesToDelete.length > 0) {
          await soqaroDatabase.transcodeJobs.bulkDelete(sourceFileHashesToDelete);
        }
      }
    }
  );

  await cleanupDeletedLocalRepositoryData(deletedLocalFileHashes, deletedLocalAssetManifests);
  if (options?.roomId) {
    const directory = await getLocalAudioDirectory();
    const repository = directory
      ? await LocalRepository.open(directory.handle, { recover: false }).catch(() => null)
      : null;
    if (repository) {
      await repository.removeRoomTrackReferences(options.roomId, uniqueTrackIds);
    }
  }
}

async function cleanupDeletedLocalRepositoryData(
  fileHashes: ReadonlySet<string>,
  manifests: ReadonlyMap<string, AudioAssetManifestRecord>
) {
  if (fileHashes.size === 0 && manifests.size === 0) return;
  const directory = await getLocalAudioDirectory();
  const repository = directory
    ? await LocalRepository.open(directory.handle, { recover: false }).catch(() => null)
    : null;
  if (!repository) return;

  const localAssetRefs = new Map<string, { kind: "original" | "playback"; profileId?: string }>();
  const protectedLocalAssetIds = new Set<string>();
  for (const fileHash of fileHashes) {
    const record = await repository.readTrack(fileHash);
    const localFile = await soqaroDatabase.localAudioFiles.get(fileHash);
    const isSavedLocally =
      localFile && (localFile.storageKind ?? "saved") === "saved";
    if (isSavedLocally || record?.retention === "library") {
      if (record?.originalAsset) {
        protectedLocalAssetIds.add(record.originalAsset.assetId);
      }
      if (record?.playbackAsset) {
        protectedLocalAssetIds.add(record.playbackAsset.assetId);
      }
      continue;
    }
    if (record?.source.kind !== "managed") continue;
    if (record.originalAsset) {
      localAssetRefs.set(record.originalAsset.assetId, { kind: "original" });
    }
    if (record.playbackAsset) {
      localAssetRefs.set(record.playbackAsset.assetId, {
        kind: "playback",
        profileId: record.playbackAsset.profileId
      });
    }
    await repository.removePath(record.source.relativePath);
    await repository.deleteTrack(fileHash);
    await soqaroDatabase.localAudioFiles.delete(fileHash);
    await soqaroDatabase.localAudioCacheFiles.delete(fileHash);
  }

  for (const record of manifests.values()) {
    if (protectedLocalAssetIds.has(record.assetId)) continue;
    if (record.manifest.kind === "original") {
      await repository.deleteOriginalAsset(record.assetId);
    } else {
      await repository.deletePlaybackAsset(record.assetId, record.manifest.profileId);
    }
  }
  for (const [assetId, asset] of localAssetRefs) {
    if (protectedLocalAssetIds.has(assetId)) continue;
    if (asset.kind === "original") {
      await repository.deleteOriginalAsset(assetId);
    } else if (asset.profileId) {
      await repository.deletePlaybackAsset(assetId, asset.profileId);
    }
  }
}

export async function cleanupOrphanedLocalAudioStorage(input: {
  preserveTrackIds: readonly string[];
  preserveAssetIds?: readonly string[];
}) {
  await backfillCachedLibraryTrackMetadataIfNeeded();

  const preservedTrackIds = new Set(input.preserveTrackIds.filter(Boolean));
  const preservedAssetIds = new Set(input.preserveAssetIds?.filter(Boolean) ?? []);

  return soqaroDatabase.transaction(
    "rw",
    [
      soqaroDatabase.cachedTrackLibrary,
      soqaroDatabase.cachedTrackLibraryMetadata,
      soqaroDatabase.trackAssetLinks,
      soqaroDatabase.assetManifests,
      soqaroDatabase.assetUnits,
      soqaroDatabase.transcodeJobs
    ],
    async () => {
      const summaries = await soqaroDatabase.cachedTrackLibraryMetadata.toArray();
      let deletedCacheCount = 0;
      const deletedCacheHashes = new Set<string>();

      for (const summary of summaries) {
        if (summary.sourceTrackIds.length === 0) {
          await soqaroDatabase.cachedTrackLibrary.delete(summary.fileHash);
          await soqaroDatabase.cachedTrackLibraryMetadata.delete(summary.fileHash);
          deletedCacheCount += 1;
          deletedCacheHashes.add(summary.fileHash);
          continue;
        }
        const staleTrackIds = summary.sourceTrackIds.filter(
          (trackId) => !preservedTrackIds.has(trackId)
        );
        if (staleTrackIds.length === 0) {
          continue;
        }

        const record = await soqaroDatabase.cachedTrackLibrary.get(summary.fileHash);
        const nextReferences = removeCachedLibrarySourceReferences(summary, staleTrackIds);
        if (nextReferences.isUnreferenced) {
          await soqaroDatabase.cachedTrackLibrary.delete(summary.fileHash);
          await soqaroDatabase.cachedTrackLibraryMetadata.delete(summary.fileHash);
          deletedCacheCount += 1;
          deletedCacheHashes.add(summary.fileHash);
          continue;
        }

        if (record) {
          await soqaroDatabase.cachedTrackLibrary.put({ ...record, ...nextReferences });
        }
        await soqaroDatabase.cachedTrackLibraryMetadata.put({
          ...summary,
          ...nextReferences
        });
      }

      const links = await soqaroDatabase.trackAssetLinks.toArray();
      const staleLinks = links.filter((link) => !preservedTrackIds.has(link.trackId));
      const remainingLinks = links.filter((link) => preservedTrackIds.has(link.trackId));
      const remainingCachedHashes = new Set(
        (await soqaroDatabase.cachedTrackLibraryMetadata.toCollection().primaryKeys())
          .filter((key): key is string => typeof key === "string")
      );
      const manifests = await soqaroDatabase.assetManifests.toArray();
      const referencedAssetIds = new Set([
        ...preservedAssetIds,
        ...remainingLinks.flatMap((link) => [link.originalAssetId, link.playbackAssetId]),
        ...manifests
          .filter((manifest) => remainingCachedHashes.has(manifest.sourceFileHash))
          .map((manifest) => manifest.assetId)
      ]);
      const orphanedManifests = manifests.filter(
        (manifest) => !referencedAssetIds.has(manifest.assetId)
      );
      const orphanedAssetIds = orphanedManifests.map((manifest) => manifest.assetId);

      if (staleLinks.length > 0) {
        await soqaroDatabase.trackAssetLinks.bulkDelete(
          staleLinks.map((link) => link.trackId)
        );
      }
      if (orphanedAssetIds.length > 0) {
        await soqaroDatabase.assetUnits.where("assetId").anyOf(orphanedAssetIds).delete();
        await soqaroDatabase.assetManifests.bulkDelete(orphanedAssetIds);
      }

      const remainingAssetSourceFileHashes = new Set(
        manifests
          .filter((manifest) => !orphanedAssetIds.includes(manifest.assetId))
          .map((manifest) => manifest.sourceFileHash)
      );
      const sourceFileHashesToDelete = [
        ...new Set([
          ...deletedCacheHashes,
          ...orphanedManifests.map((manifest) => manifest.sourceFileHash)
        ])
      ].filter(
        (fileHash) =>
          !remainingCachedHashes.has(fileHash) && !remainingAssetSourceFileHashes.has(fileHash)
      );
      if (sourceFileHashesToDelete.length > 0) {
        await soqaroDatabase.transcodeJobs.bulkDelete(sourceFileHashesToDelete);
      }

      return {
        deletedCacheCount,
        deletedAssetCount: orphanedAssetIds.length,
        deletedLinkCount: staleLinks.length
      };
    }
  );
}
