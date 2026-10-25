import type { BilibiliTrackCandidate, NeteaseTrackCandidate, ProviderLyrics, QqMusicTrackCandidate } from "@soqaro/shared";
import type { CachedLibraryTrackSummaryRecord, LocalPlaylistTrackRecord } from "@/features/library/indexeddb";
import type { LocalRepositoryPlaylistRecord } from "@/features/library/local-repository";

export type ProviderTrack = NeteaseTrackCandidate | QqMusicTrackCandidate | BilibiliTrackCandidate;

export type LocalPlaylistRecord = {
  id: string;
  title: string;
  description: string | null;
  trackIds: string[];
  sourceDirectoryId?: string | null;
  sourceDirectoryName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function createLocalPlaylistId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `local-playlist-${randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function createLocalPlaylistSourceId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `local-playlist-source-${randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function providerTrackKey(provider: string, providerTrackId: string): string {
  return `provider:${provider}:${providerTrackId}`;
}

export function localPlaylistTrackId(track: ProviderTrack): string {
  return providerTrackKey(track.provider, track.providerTrackId);
}

export function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Keep playlist cards stable across repository restores and both playlist views. */
export function sortLocalPlaylists(playlists: readonly LocalPlaylistRecord[]): LocalPlaylistRecord[] {
  return [...playlists].sort((left, right) => {
    const createdOrder = left.createdAt.localeCompare(right.createdAt);
    if (createdOrder !== 0) return createdOrder;

    const updatedOrder = left.updatedAt.localeCompare(right.updatedAt);
    if (updatedOrder !== 0) return updatedOrder;
    return left.id.localeCompare(right.id);
  });
}

export function toLocalPlaylistTrackInput(input: {
  track: ProviderTrack;
  lyrics?: ProviderLyrics | null;
  fileHash?: string | null;
  fileName?: string | null;
  sizeBytes?: number;
  mimeType?: string;
  availableOffline?: boolean;
}): Omit<LocalPlaylistTrackRecord, "createdAt" | "updatedAt"> {
  const { track, lyrics } = input;
  return {
    id: localPlaylistTrackId(track),
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    mimeType: input.mimeType ?? "audio/mpeg",
    sizeBytes: input.sizeBytes ?? 0,
    artworkUrl: track.artworkUrl,
    lyrics: lyrics?.wordSyncedLyric ?? lyrics?.plainLyric ?? null,
    translatedLyrics: lyrics?.translatedLyric ?? null,
    romanizedLyrics: lyrics?.romanizedLyric ?? null,
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    fileHash: input.fileHash ?? null,
    fileName: input.fileName ?? null,
    availableOffline: input.availableOffline ?? false
  };
}

export function toProviderTrackRecord(
  track: ProviderTrack,
  existing?: LocalPlaylistTrackRecord
): LocalPlaylistTrackRecord {
  const now = new Date().toISOString();
  const metadata = toLocalPlaylistTrackInput({ track, availableOffline: false });
  return {
    ...(existing ?? metadata),
    id: metadata.id,
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    durationMs: metadata.durationMs,
    artworkUrl: track.artworkUrl ?? existing?.artworkUrl ?? null,
    provider: metadata.provider,
    providerTrackId: metadata.providerTrackId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

export function toCachedProviderTrack(record: LocalPlaylistTrackRecord): ProviderTrack | null {
  if (
    (record.provider !== "netease" &&
      record.provider !== "qqmusic" &&
      record.provider !== "bilibili") ||
    !record.providerTrackId
  ) {
    return null;
  }

  return {
    provider: record.provider,
    providerTrackId: record.providerTrackId,
    access: "unknown",
    quality: null,
    title: record.title,
    artist: record.artist,
    album: record.album,
    durationMs: record.durationMs,
    artworkUrl: record.artworkUrl
  };
}

export function reconcileTrackAvailability(
  track: LocalPlaylistTrackRecord,
  fileNames: ReadonlyMap<string, string>,
  availableHashes: ReadonlySet<string>
): LocalPlaylistTrackRecord {
  if (!track.fileHash) {
    return track.availableOffline ? { ...track, availableOffline: false } : track;
  }

  const hasAvailableFile = availableHashes.has(track.fileHash);
  return {
    ...track,
    fileName: hasAvailableFile ? fileNames.get(track.fileHash) ?? track.fileName : null,
    availableOffline: hasAvailableFile
  };
}

export function fromCachedSummary(
  summary: CachedLibraryTrackSummaryRecord,
  fileName: string | null,
  availableOffline: boolean
): LocalPlaylistTrackRecord {
  return {
    id: `local:${summary.fileHash}`,
    title: summary.title,
    artist: summary.artist,
    album: summary.album ?? null,
    durationMs: summary.durationMs,
    mimeType: summary.mimeType,
    sizeBytes: summary.sizeBytes,
    artworkUrl: summary.artworkUrl ?? null,
    lyrics: summary.lyrics ?? null,
    translatedLyrics: summary.translatedLyrics ?? null,
    romanizedLyrics: summary.romanizedLyrics ?? null,
    ...(summary.loudness ? { loudness: summary.loudness } : {}),
    provider: summary.provider ?? "local_upload",
    providerTrackId: summary.providerTrackId ?? null,
    fileHash: summary.fileHash,
    fileName,
    availableOffline,
    createdAt: summary.cachedAt,
    updatedAt: summary.cachedAt
  };
}

export function toRepositoryPlaylist(playlist: LocalPlaylistRecord): LocalRepositoryPlaylistRecord {
  return {
    schemaVersion: 1,
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    sourceDirectoryId: playlist.sourceDirectoryId ?? null,
    sourceDirectoryName: playlist.sourceDirectoryName ?? null,
    trackRefs: playlist.trackIds.map((trackId) => {
      const providerMatch = /^provider:(netease|qqmusic):(.+)$/.exec(trackId);
      if (providerMatch) {
        return {
          kind: "provider" as const,
          provider: providerMatch[1] as "netease" | "qqmusic",
          trackId: providerMatch[2]!
        };
      }
      return {
        kind: "content" as const,
        fileHash: trackId.startsWith("local:") ? trackId.slice("local:".length) : trackId,
        trackId
      };
    }),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt
  };
}

export function fromRepositoryPlaylist(record: LocalRepositoryPlaylistRecord): LocalPlaylistRecord {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    sourceDirectoryId: record.sourceDirectoryId ?? null,
    sourceDirectoryName: record.sourceDirectoryName ?? null,
    trackIds: record.trackRefs.map((trackRef) =>
      trackRef.kind === "provider"
        ? providerTrackKey(trackRef.provider, trackRef.trackId)
        : trackRef.trackId ?? `local:${trackRef.fileHash}`
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
