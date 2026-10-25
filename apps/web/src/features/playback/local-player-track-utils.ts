import type { PlaybackMode, PlaybackSnapshot, TrackMeta } from "@soqaro/shared";
import {
  getCachedLibraryTrack,
  upsertCachedLibraryTrack,
  upsertLocalPlaylistTrack,
  type LocalPlaylistTrackRecord
} from "@/features/library/indexeddb";
import {
  getLocalAudioCacheFile,
  getLocalAudioFile
} from "@/features/library/local-audio-storage";
import { readEmbeddedAudioMetadata } from "@/features/library/audio-metadata";
import { analyzeAudioBlobLoudness } from "./loudness";

export const localQueueOwnerId = "local-playlist";

export function buildLocalQueueItemId(trackId: string) {
  return `local-queue:${trackId}`;
}

export function firstMetadataText(...values: Array<string | null | undefined>) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

export function isBrowserLocalArtwork(value: string | null | undefined) {
  return Boolean(value && /^(?:data|blob):/i.test(value));
}

export function mergeLocalTrackRecord(
  track: LocalPlaylistTrackRecord,
  libraryRecords: readonly LocalPlaylistTrackRecord[]
): LocalPlaylistTrackRecord {
  const libraryTrack = libraryRecords.find(
    (candidate) =>
      candidate.id === track.id ||
      (!!track.fileHash && candidate.fileHash === track.fileHash) ||
      (!!track.providerTrackId &&
        candidate.provider === track.provider &&
        candidate.providerTrackId === track.providerTrackId)
  );
  if (!libraryTrack) {
    return {
      ...track,
      title: firstMetadataText(track.title) ?? "未命名歌曲",
      artist: firstMetadataText(track.artist) ?? "本地歌曲",
      album: track.album ?? null
    };
  }

  return {
    ...libraryTrack,
    ...track,
    title: firstMetadataText(track.title) ?? firstMetadataText(libraryTrack.title) ?? "未命名歌曲",
    artist: firstMetadataText(track.artist) ?? firstMetadataText(libraryTrack.artist) ?? "本地歌曲",
    album: track.album ?? libraryTrack.album,
    durationMs: track.durationMs || libraryTrack.durationMs,
    mimeType: track.mimeType || libraryTrack.mimeType,
    sizeBytes: track.sizeBytes || libraryTrack.sizeBytes,
    artworkUrl: isBrowserLocalArtwork(libraryTrack.artworkUrl)
      ? libraryTrack.artworkUrl
      : track.artworkUrl ?? libraryTrack.artworkUrl,
    lyrics: track.lyrics ?? libraryTrack.lyrics,
    translatedLyrics: track.translatedLyrics ?? libraryTrack.translatedLyrics,
    romanizedLyrics: track.romanizedLyrics ?? libraryTrack.romanizedLyrics,
    loudness: track.loudness ?? libraryTrack.loudness,
    fileHash: track.fileHash ?? libraryTrack.fileHash,
    fileName: track.fileName ?? libraryTrack.fileName,
    sourceDirectoryId: track.sourceDirectoryId ?? libraryTrack.sourceDirectoryId,
    availableOffline: track.availableOffline || libraryTrack.availableOffline
  };
}

export function toTrackMeta(track: LocalPlaylistTrackRecord): TrackMeta {
  const sourceRef =
    track.provider === "local_upload"
      ? undefined
      : { provider: track.provider, trackId: track.providerTrackId ?? track.id };

  return {
    id: track.id,
    title: firstMetadataText(track.title) ?? "未命名歌曲",
    artist: firstMetadataText(track.artist) ?? "本地歌曲",
    album: track.album ?? null,
    durationMs: Number.isFinite(track.durationMs) ? track.durationMs : 0,
    bitrate: null,
    sizeBytes: track.sizeBytes,
    codec: null,
    mimeType: track.mimeType,
    lyrics: track.lyrics,
    translatedLyrics: track.translatedLyrics ?? null,
    romanizedLyrics: track.romanizedLyrics ?? null,
    fileHash: track.fileHash ?? track.id,
    artworkUrl: track.artworkUrl,
    ownerSessionId: localQueueOwnerId,
    ownerNickname: "本地歌单",
    sourceType: track.provider,
    sourceRef,
    ...(track.loudness ? { loudness: track.loudness } : {})
  };
}

export async function loadLocalAudioFile(track: LocalPlaylistTrackRecord): Promise<Blob | null> {
  if (!track.fileHash) return null;

  const localFile = await getLocalAudioFile(
    track.fileHash,
    track.sourceDirectoryId,
    track.fileName
  );
  if (localFile) return localFile;

  const cachedRecord = await getCachedLibraryTrack(track.fileHash);
  if (cachedRecord?.file) return cachedRecord.file;

  const cachedFile = await getLocalAudioCacheFile(track.fileHash);
  if (cachedFile) return cachedFile;

  // Support Alist online streaming: fetch via stream endpoint
  if (track.provider === "alist" && track.fileName && (track.fileName.startsWith("/") || track.fileName.startsWith("http"))) {
    try {
      const res = await fetch(track.fileName);
      if (res.ok) return await res.blob();
    } catch {
      // ignore
    }
  }

  return null;
}

export async function enrichTrackMetadata(
  track: LocalPlaylistTrackRecord,
  file: Blob,
  metadataEnrichedHashes: Set<string>
): Promise<LocalPlaylistTrackRecord> {
  const needsMetadata =
    !track.title?.trim() ||
    !track.artist?.trim() ||
    !track.album ||
    !Number.isFinite(track.durationMs) ||
    track.durationMs <= 0 ||
    !track.artworkUrl ||
    !track.lyrics;
  if (!needsMetadata || (track.fileHash && metadataEnrichedHashes.has(track.fileHash))) {
    return track;
  }

  const [embedded, cached] = await Promise.all([
    readEmbeddedAudioMetadata(file),
    track.fileHash ? getCachedLibraryTrack(track.fileHash).catch(() => null) : Promise.resolve(null)
  ]);
  const loudness = track.loudness ?? cached?.loudness ?? null;
  if (!loudness && track.fileHash) {
    void analyzeAudioBlobLoudness(file).then((result) => {
      if (result && track.fileHash) {
        getCachedLibraryTrack(track.fileHash).then((record) => {
          if (record) {
            upsertCachedLibraryTrack({ ...record, loudness: result });
          }
        }).catch(() => undefined);
      }
    }).catch(() => undefined);
  }
  if (track.fileHash) metadataEnrichedHashes.add(track.fileHash);
  const preferEmbedded = track.provider === "local_upload";
  const nextTrack: LocalPlaylistTrackRecord = {
    ...track,
    title:
      firstMetadataText(
        preferEmbedded ? embedded.title : null,
        cached?.title,
        track.title,
        embedded.title
      ) ?? "未命名歌曲",
    artist:
      firstMetadataText(
        preferEmbedded ? embedded.artist : null,
        cached?.artist,
        track.artist,
        embedded.artist
      ) ?? "本地歌曲",
    album: firstMetadataText(
      preferEmbedded ? embedded.album : null,
      cached?.album,
      track.album,
      embedded.album
    ),
    durationMs:
      (preferEmbedded ? embedded.durationMs : null) ??
      cached?.durationMs ??
      (track.durationMs > 0 ? track.durationMs : null) ??
      embedded.durationMs ??
      0,
    artworkUrl: firstMetadataText(
      preferEmbedded ? embedded.artworkUrl : null,
      cached?.artworkUrl,
      track.artworkUrl,
      embedded.artworkUrl
    ),
    lyrics: firstMetadataText(
      preferEmbedded ? embedded.lyrics : null,
      cached?.lyrics,
      track.lyrics,
      embedded.lyrics
    ),
    ...(loudness ? { loudness } : {}),
    mimeType: track.mimeType || file.type || cached?.mimeType || track.mimeType,
    sizeBytes: track.sizeBytes || file.size || cached?.sizeBytes || track.sizeBytes
  };

  const changed =
    nextTrack.title !== track.title ||
    nextTrack.artist !== track.artist ||
    nextTrack.album !== track.album ||
    nextTrack.durationMs !== track.durationMs ||
    nextTrack.artworkUrl !== track.artworkUrl ||
    nextTrack.lyrics !== track.lyrics ||
    nextTrack.mimeType !== track.mimeType ||
    nextTrack.sizeBytes !== track.sizeBytes;
  const loudnessChanged = nextTrack.loudness?.gainDb !== track.loudness?.gainDb;
  if (!changed && !loudnessChanged) return nextTrack;

  const persistedTrack = {
    ...nextTrack,
    updatedAt: new Date().toISOString()
  };
  void upsertLocalPlaylistTrack(persistedTrack).catch(() => {
    if (track.fileHash) metadataEnrichedHashes.delete(track.fileHash);
  });
  return persistedTrack;
}

export function buildLocalPlaybackSnapshot(input: {
  record: LocalPlaylistTrackRecord | null;
  status: PlaybackSnapshot["status"];
  positionMs: number;
  startedAt?: string | null;
  playbackMode: PlaybackMode;
  playbackRevision: number;
  mediaEpoch: number;
  nextQueueItemId: string | null;
  queue: readonly LocalPlaylistTrackRecord[];
}): PlaybackSnapshot | null {
  if (!input.record) return null;

  return {
    status: input.status,
    currentTrackId: input.record.id,
    currentQueueItemId: input.queue.some((track) => track.id === input.record?.id)
      ? buildLocalQueueItemId(input.record.id)
      : null,
    playbackAssetId: null,
    startAt: null,
    sourceSessionId: null,
    sourcePeerId: null,
    sourceTrackId: input.record.id,
    positionMs: Math.max(0, Math.round(input.positionMs)),
    startedAt: input.startedAt ?? null,
    queueVersion: 1,
    playbackRevision: input.playbackRevision,
    mediaEpoch: input.mediaEpoch,
    playbackMode: input.playbackMode,
    nextQueueItemId: input.nextQueueItemId
  };
}
