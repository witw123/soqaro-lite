import {
  deleteCachedLibraryTrack,
  listCachedLibraryTrackSummaries,
  type CachedLibraryTrackSummaryRecord
} from "./indexeddb";

export type StorageQuotaInfo = {
  usageBytes: number;
  quotaBytes: number;
  usagePercentage: number;
  cachedTrackCount: number;
  cachedTrackBytes: number;
};

export type PurgeStaleCacheOptions = {
  /** Target number of bytes to free up (stops once freed >= targetFreeBytes) */
  targetFreeBytes?: number;
  /** Keep tracks cached within maxAgeMs (e.g. 7 days in ms = 7 * 86400 * 1000) */
  maxAgeMs?: number;
  /** Set of track keys (e.g. "netease:12345" or providerTrackId) to preserve */
  preserveFavoriteKeys?: Set<string>;
  /** File hashes to exclude from deletion (e.g. currently playing / active) */
  excludedFileHashes?: Set<string>;
};

export type PurgeResult = {
  purgedCount: number;
  freedBytes: number;
};

/**
 * Estimates overall IndexedDB and browser storage quota and cached track library size.
 */
export async function getStorageQuotaEstimate(): Promise<StorageQuotaInfo> {
  let usageBytes = 0;
  let quotaBytes = 0;

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usageBytes = estimate.usage ?? 0;
      quotaBytes = estimate.quota ?? 0;
    } catch {
      // Safe fallback if estimate is rejected
    }
  }

  const summaries = await listCachedLibraryTrackSummaries().catch(() => [] as CachedLibraryTrackSummaryRecord[]);
  const cachedTrackCount = summaries.length;
  const cachedTrackBytes = summaries.reduce((acc, track) => acc + (track.sizeBytes || 0), 0);

  if (usageBytes === 0) {
    usageBytes = cachedTrackBytes;
  }
  if (quotaBytes === 0) {
    quotaBytes = Math.max(1024 * 1024 * 1024, usageBytes * 2); // Default 1GB baseline
  }

  const usagePercentage = quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 100)) : 0;

  return {
    usageBytes,
    quotaBytes,
    usagePercentage,
    cachedTrackCount,
    cachedTrackBytes
  };
}

/**
 * LRU cache evictor for cached library tracks.
 * Purges older cached tracks while respecting favorites and currently active tracks.
 */
export async function purgeStaleCachedTracks(
  options: PurgeStaleCacheOptions = {}
): Promise<PurgeResult> {
  const summaries = await listCachedLibraryTrackSummaries().catch(() => [] as CachedLibraryTrackSummaryRecord[]);
  if (summaries.length === 0) {
    return { purgedCount: 0, freedBytes: 0 };
  }

  // Sort by oldest cachedAt first (LRU order)
  const sorted = [...summaries].sort((a, b) => {
    const timeA = a.cachedAt ? new Date(a.cachedAt).getTime() : 0;
    const timeB = b.cachedAt ? new Date(b.cachedAt).getTime() : 0;
    return timeA - timeB;
  });

  const now = Date.now();
  let purgedCount = 0;
  let freedBytes = 0;

  for (const track of sorted) {
    if (options.targetFreeBytes && freedBytes >= options.targetFreeBytes) {
      break;
    }

    if (options.excludedFileHashes && options.excludedFileHashes.has(track.fileHash)) {
      continue;
    }

    if (options.preserveFavoriteKeys) {
      const trackKey = track.provider && track.providerTrackId
        ? `${track.provider}:${track.providerTrackId}`
        : track.providerTrackId;
      if (trackKey && options.preserveFavoriteKeys.has(trackKey)) {
        continue;
      }
    }

    if (options.maxAgeMs && track.cachedAt) {
      const ageMs = now - new Date(track.cachedAt).getTime();
      if (ageMs < options.maxAgeMs) {
        // Track is newer than max age; skip
        continue;
      }
    }

    try {
      await deleteCachedLibraryTrack(track.fileHash);
      purgedCount += 1;
      freedBytes += track.sizeBytes || 0;
    } catch {
      // Continue purging remaining tracks
    }
  }

  return {
    purgedCount,
    freedBytes
  };
}
