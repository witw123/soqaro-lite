import {
  listCachedLibraryTrackHashes,
  listCachedLibraryTrackSummaries,
  listLocalAudioCacheFiles,
  listLocalAudioFiles,
  listLocalPlaylistTracks,
  type LocalPlaylistTrackRecord
} from "@/features/library/indexeddb";
import { getConfiguredLocalRepository } from "@/features/library/local-audio-storage";
import {
  createLocalPlaylistId,
  fromCachedSummary,
  fromRepositoryPlaylist,
  providerTrackKey,
  reconcileTrackAvailability,
  sameStringArray,
  sortLocalPlaylists,
  toRepositoryPlaylist,
  type LocalPlaylistRecord
} from "./local-playlist-mappers";

// Surface the raw local-playlist track persistence for view code without
// exposing the low-level IndexedDB storage module directly.
export { upsertLocalPlaylistTrack, type LocalPlaylistTrackRecord } from "@/features/library/indexeddb";

// Re-export mapper types and utilities for existing callers
export {
  createLocalPlaylistId,
  createLocalPlaylistSourceId,
  fromCachedSummary,
  fromRepositoryPlaylist,
  localPlaylistTrackId,
  providerTrackKey,
  reconcileTrackAvailability,
  sameStringArray,
  sortLocalPlaylists,
  toCachedProviderTrack,
  toLocalPlaylistTrackInput,
  toProviderTrackRecord,
  toRepositoryPlaylist,
  type LocalPlaylistRecord,
  type ProviderTrack
} from "./local-playlist-mappers";

// Re-export directory sync utilities for existing callers
export {
  cancelSelectedLocalDirectorySync,
  directoryScanSource,
  hashAudioBlob,
  importLocalPlaylistDirectoryTracks,
  inferAudioMimeType,
  performSelectedLocalDirectorySync,
  readDirectoryTrackMetadata,
  syncSelectedLocalDirectoryTracks,
  throwIfAborted
} from "./local-playlist-directory-sync";

export const defaultLocalPlaylistId = "local-default";
const defaultLocalPlaylistTitle = "本地音乐";
let localPlaylistPersistencePromise: Promise<void> = Promise.resolve();
let localPlaylists: LocalPlaylistRecord[] = [];

export function listLocalPlaylists(): LocalPlaylistRecord[] {
  return localPlaylists;
}

export function mergeLocalPlaylists(records: LocalPlaylistRecord[]) {
  const byId = new Map(localPlaylists.map((playlist) => [playlist.id, playlist]));
  for (const record of records) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  localPlaylists = sortLocalPlaylists([...byId.values()]);
  return localPlaylists;
}

export async function restoreLocalPlaylistsFromRepository() {
  await flushLocalPlaylistPersistence();
  const repository = await getConfiguredLocalRepository();
  if (!repository) {
    localPlaylists = [];
    return localPlaylists;
  }

  try {
    const persisted = await repository.listPlaylists();
    localPlaylists = sortLocalPlaylists(persisted.map(fromRepositoryPlaylist));
    return localPlaylists;
  } catch {
    localPlaylists = [];
    return localPlaylists;
  }
}

export function ensureDefaultLocalPlaylist(input: {
  trackIds: string[];
  sourceDirectoryName: string | null;
}) {
  const current = listLocalPlaylists().find((playlist) => playlist.id === defaultLocalPlaylistId);
  const title = input.sourceDirectoryName || defaultLocalPlaylistTitle;
  const description = input.sourceDirectoryName
    ? `${input.sourceDirectoryName}中的本地歌曲`
    : "本地音乐目录中的歌曲";

  if (!current) {
    const now = new Date().toISOString();
    const playlist: LocalPlaylistRecord = {
      id: defaultLocalPlaylistId,
      title,
      description,
      trackIds: [...new Set(input.trackIds)],
      sourceDirectoryId: null,
      sourceDirectoryName: input.sourceDirectoryName,
      createdAt: now,
      updatedAt: now
    };
    writeLocalPlaylists([...listLocalPlaylists(), playlist]);
    return sortLocalPlaylists(listLocalPlaylists());
  }

  const nextTrackIds = [...new Set(input.trackIds)];
  const nextTrackIdSet = new Set(nextTrackIds);
  // Keep the user's established order stable; only append files that appeared since the last scan.
  const orderedTrackIds = [
    ...current.trackIds.filter((trackId) => nextTrackIdSet.has(trackId)),
    ...nextTrackIds.filter((trackId) => !current.trackIds.includes(trackId))
  ];
  const tracksChanged = !sameStringArray(current.trackIds, orderedTrackIds);
  const sourceChanged = current.sourceDirectoryName !== input.sourceDirectoryName;
  const titleChanged = current.title !== title;
  const updated: LocalPlaylistRecord = {
    ...current,
    title,
    description: current.description === "项目根目录中的本地歌曲" ? description : (current.description || description),
    sourceDirectoryId: null,
    trackIds: orderedTrackIds,
    sourceDirectoryName: input.sourceDirectoryName,
    updatedAt: tracksChanged || sourceChanged || titleChanged
      ? new Date().toISOString()
      : current.updatedAt
  };
  if (tracksChanged || sourceChanged || titleChanged) {
    writeLocalPlaylists(listLocalPlaylists().map((playlist) => playlist.id === current.id ? updated : playlist));
  }
  return sortLocalPlaylists(listLocalPlaylists());
}

export function getDefaultLocalPlaylistTrackIds(
  tracks: readonly LocalPlaylistTrackRecord[],
  savedFileHashes: ReadonlySet<string>,
  options?: { allowUnverifiedWhenEmpty?: boolean }
) {
  if (savedFileHashes.size === 0 && options?.allowUnverifiedWhenEmpty) {
    return tracks
      .filter((track) =>
        track.availableOffline &&
        !!track.fileHash &&
        !track.sourceDirectoryId
      )
      .map((track) => track.id);
  }
  return tracks
    .filter((track) =>
      track.availableOffline &&
      !!track.fileHash &&
      !track.sourceDirectoryId &&
      savedFileHashes.has(track.fileHash)
    )
    .map((track) => track.id);
}

export async function flushLocalPlaylistPersistence() {
  await localPlaylistPersistencePromise.catch(() => undefined);
}

export function createLocalPlaylist(input: {
  title: string;
  description?: string | null;
  trackIds?: string[];
  sourceDirectoryId?: string | null;
  sourceDirectoryName?: string | null;
}) {
  const now = new Date().toISOString();
  const playlist: LocalPlaylistRecord = {
    id: createLocalPlaylistId(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    trackIds: [...new Set(input.trackIds ?? [])],
    sourceDirectoryId: input.sourceDirectoryId ?? null,
    sourceDirectoryName: input.sourceDirectoryName ?? null,
    createdAt: now,
    updatedAt: now
  };
  writeLocalPlaylists([...listLocalPlaylists(), playlist]);
  return playlist;
}

export function deleteLocalPlaylist(playlistId: string) {
  writeLocalPlaylists(listLocalPlaylists().filter((playlist) => playlist.id !== playlistId));
}

export function updateLocalPlaylist(playlistId: string, input: {
  trackIds?: string[];
  title?: string;
  description?: string | null;
  sourceDirectoryId?: string | null;
  sourceDirectoryName?: string | null;
}) {
  const current = listLocalPlaylists().find((playlist) => playlist.id === playlistId);
  if (!current) return null;
  const updated: LocalPlaylistRecord = {
    ...current,
    title: input.title?.trim() || current.title,
    description: input.description === undefined ? current.description : input.description?.trim() || null,
    trackIds: input.trackIds ?? current.trackIds,
    sourceDirectoryId: input.sourceDirectoryId === undefined
      ? current.sourceDirectoryId ?? null
      : input.sourceDirectoryId,
    sourceDirectoryName: input.sourceDirectoryName === undefined
      ? current.sourceDirectoryName ?? null
      : input.sourceDirectoryName,
    updatedAt: new Date().toISOString()
  };
  writeLocalPlaylists(listLocalPlaylists().map((playlist) => playlist.id === playlistId ? updated : playlist));
  return updated;
}

export async function listMergedLocalPlaylistTracks() {
  const [explicit, summaries, cachedFileHashes, savedFiles, cacheFiles] = await Promise.all([
    listLocalPlaylistTracks(),
    listCachedLibraryTrackSummaries(),
    listCachedLibraryTrackHashes(),
    listLocalAudioFiles("saved"),
    listLocalAudioCacheFiles()
  ]);
  const fileNames = new Map<string, string>();
  for (const file of [...savedFiles, ...cacheFiles]) {
    fileNames.set(file.fileHash, file.fileName);
  }
  const availableHashes = new Set([
    ...fileNames.keys(),
    ...cachedFileHashes
  ]);
  const reconciledExplicit = explicit.map((track) => reconcileTrackAvailability(track, fileNames, availableHashes));
  const explicitByHash = new Set(reconciledExplicit.map((track) => track.fileHash).filter(Boolean));

  const derived = summaries
    .filter((summary) => availableHashes.has(summary.fileHash) && !explicitByHash.has(summary.fileHash))
    .map((summary) => fromCachedSummary(summary, fileNames.get(summary.fileHash) ?? null, true));
  return [...reconciledExplicit, ...derived];
}

type RoomPlaylistTrackMultiIndex = {
  byTrackId: Map<string, LocalPlaylistTrackRecord>;
  byFileHash: Map<string, LocalPlaylistTrackRecord>;
  byProviderKey: Map<string, LocalPlaylistTrackRecord>;
  timestamp: number;
};

let cachedTrackMultiIndex: RoomPlaylistTrackMultiIndex | null = null;
let pendingTrackMultiIndexPromise: Promise<RoomPlaylistTrackMultiIndex> | null = null;
const TRACK_INDEX_TTL_MS = 10_000;

export function invalidateRoomPlaylistTrackIndex(): void {
  cachedTrackMultiIndex = null;
  pendingTrackMultiIndexPromise = null;
}

export async function getRoomPlaylistTrackMultiIndex(): Promise<RoomPlaylistTrackMultiIndex> {
  const now = Date.now();
  if (cachedTrackMultiIndex && now - cachedTrackMultiIndex.timestamp < TRACK_INDEX_TTL_MS) {
    return cachedTrackMultiIndex;
  }
  if (pendingTrackMultiIndexPromise) {
    return pendingTrackMultiIndexPromise;
  }

  pendingTrackMultiIndexPromise = (async () => {
    const [explicit, summaries, cachedFileHashes, savedFiles, cacheFiles] = await Promise.all([
      listLocalPlaylistTracks(),
      listCachedLibraryTrackSummaries(),
      listCachedLibraryTrackHashes(),
      listLocalAudioFiles("saved"),
      listLocalAudioCacheFiles()
    ]);
    const fileNames = new Map<string, string>();
    for (const file of [...savedFiles, ...cacheFiles]) {
      fileNames.set(file.fileHash, file.fileName);
    }
    const availableHashes = new Set([
      ...fileNames.keys(),
      ...cachedFileHashes
    ]);

    const byTrackId = new Map<string, LocalPlaylistTrackRecord>();
    const byFileHash = new Map<string, LocalPlaylistTrackRecord>();
    const byProviderKey = new Map<string, LocalPlaylistTrackRecord>();

    const indexRecord = (record: LocalPlaylistTrackRecord) => {
      if (record.id && !byTrackId.has(record.id)) {
        byTrackId.set(record.id, record);
      }
      if (record.fileHash && !byFileHash.has(record.fileHash)) {
        byFileHash.set(record.fileHash, record);
      }
      if (
        (record.provider === "netease" || record.provider === "qqmusic") &&
        record.providerTrackId
      ) {
        const pKey = providerTrackKey(record.provider, record.providerTrackId);
        if (!byProviderKey.has(pKey)) {
          byProviderKey.set(pKey, record);
        }
      }
    };

    for (const track of explicit.map((item) => reconcileTrackAvailability(item, fileNames, availableHashes))) {
      indexRecord(track);
    }
    for (const summary of summaries) {
      const record = fromCachedSummary(
        summary,
        fileNames.get(summary.fileHash) ?? null,
        availableHashes.has(summary.fileHash)
      );
      indexRecord(record);
      for (const trackId of summary.sourceTrackIds) {
        if (!byTrackId.has(trackId)) {
          byTrackId.set(trackId, record);
        }
      }
    }

    const multiIndex: RoomPlaylistTrackMultiIndex = {
      byTrackId,
      byFileHash,
      byProviderKey,
      timestamp: Date.now()
    };
    cachedTrackMultiIndex = multiIndex;
    pendingTrackMultiIndexPromise = null;
    return multiIndex;
  })().catch((err) => {
    pendingTrackMultiIndexPromise = null;
    throw err;
  });

  return pendingTrackMultiIndexPromise;
}

export async function listRoomPlaylistTrackIndex(): Promise<Map<string, LocalPlaylistTrackRecord>> {
  const multiIndex = await getRoomPlaylistTrackMultiIndex();
  return multiIndex.byTrackId;
}

export type RoomPlaylistTrackQuery = {
  trackId?: string | null;
  fileHash?: string | null;
  provider?: string | null;
  providerTrackId?: string | null;
};

export async function findRoomPlaylistTrackRecord(
  query: RoomPlaylistTrackQuery
): Promise<LocalPlaylistTrackRecord | null> {
  const multiIndex = await getRoomPlaylistTrackMultiIndex();
  if (query.trackId) {
    const byId = multiIndex.byTrackId.get(query.trackId);
    if (byId) return byId;
  }
  if (
    (query.provider === "netease" || query.provider === "qqmusic") &&
    query.providerTrackId
  ) {
    const pKey = providerTrackKey(query.provider, query.providerTrackId);
    const byProvider = multiIndex.byProviderKey.get(pKey);
    if (byProvider) return byProvider;
  }
  if (query.fileHash) {
    const byHash = multiIndex.byFileHash.get(query.fileHash);
    if (byHash) return byHash;
  }
  return null;
}

function writeLocalPlaylists(playlists: LocalPlaylistRecord[]) {
  invalidateRoomPlaylistTrackIndex();
  const nextPlaylists = sortLocalPlaylists(playlists);
  localPlaylists = nextPlaylists;
  localPlaylistPersistencePromise = localPlaylistPersistencePromise
    .catch(() => undefined)
    .then(() => mirrorLocalPlaylistsToRepository(nextPlaylists))
    .catch(() => undefined);
}

async function mirrorLocalPlaylistsToRepository(playlists: LocalPlaylistRecord[]) {
  const repository = await getConfiguredLocalRepository();
  if (!repository) return;
  const activeIds = new Set(playlists.map((playlist) => playlist.id));
  const persisted = await repository.listPlaylists();
  for (const playlist of persisted) {
    if (!activeIds.has(playlist.id)) {
      await repository.deletePlaylist(playlist.id);
    }
  }
  for (const playlist of playlists) {
    await repository.writePlaylist(toRepositoryPlaylist(playlist));
  }
}
