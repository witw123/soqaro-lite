import type { TrackMeta } from "@soqaro/shared";
import type {
  CachedLibraryTrackRecord,
  CachedLibraryTrackSummaryRecord
} from "@/features/library/indexeddb";
import type {
  CachedLibraryTrack,
  CachedLibraryTrackFile
} from "./audio-utils";
import { isCachedLibraryTrackUsableForRoomTrack } from "./cached-library-track-policy";
import {
  createInFlightCachedLibraryTrackFileLoader,
  toCachedLibraryFileFromBlob,
  toCachedLibraryTrack,
  toCachedLibraryTrackFile
} from "./cache-library-files";
import { resolveProviderTrackSource } from "./provider-track-identity";

export const cacheLibraryChangedEventName = "soqaro-cache-library-changed";

export function notifyCacheLibraryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(cacheLibraryChangedEventName));
  }
}

export {
  buildCachedLibraryFileName,
  createInFlightCachedLibraryTrackFileLoader,
  toCachedLibraryFile,
  toCachedLibraryFileFromBlob,
  toCachedLibraryTrack,
  toCachedLibraryTrackFile
} from "./cache-library-files";

type CacheLibraryTrackUpsertInput = {
  track: Pick<
    TrackMeta,
    | "id"
    | "title"
    | "artist"
    | "mimeType"
    | "durationMs"
    | "sizeBytes"
    | "fileHash"
    | "ownerNickname"
  > & Partial<Pick<TrackMeta, "album" | "artworkUrl" | "sourceType" | "sourceRef" | "loudness">> & {
    lyrics?: string | null;
    translatedLyrics?: string | null;
    romanizedLyrics?: string | null;
  };
  roomId: string;
  file: File | Blob;
};

export type CacheLibraryTrackUpsertRecord = {
  fileHash: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  lyrics?: string | null;
  translatedLyrics?: string | null;
  romanizedLyrics?: string | null;
  provider?: "netease" | "qqmusic" | "bilibili" | "alist" | "local_upload";
  providerTrackId?: string | null;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  loudness?: TrackMeta["loudness"];
  file: File;
  sourceTrackIds: string[];
  sourceRoomIds: string[];
  lastSourceTrackId: string;
  lastSourceRoomId: string;
  lastOwnerNickname: string | null;
};

export function hasUsableCachedLibraryFileForRoomTrack(input: {
  cachedTrack:
    | (CachedLibraryTrackRecord & { file?: Blob | null })
    | (CachedLibraryTrackSummaryRecord & { file?: Blob | null })
    | CachedLibraryTrack
    | CachedLibraryTrackFile
    | null
    | undefined;
  roomTrack:
    | Pick<TrackMeta, "id" | "fileHash" | "durationMs" | "sizeBytes">
    | null
    | undefined;
}) {
  return !!(
    input.cachedTrack &&
    "file" in input.cachedTrack &&
    input.cachedTrack.file &&
    isCachedLibraryTrackUsableForRoomTrack({
      cachedTrack: input.cachedTrack,
      roomTrack: input.roomTrack
    })
  );
}

export async function loadCacheLibrarySnapshot(input: {
  listCachedLibraryTrackSummaries: () => Promise<CachedLibraryTrackSummaryRecord[]>;
}) {
  const records = await input.listCachedLibraryTrackSummaries();
  const tracks = records.map(toCachedLibraryTrack);

  return {
    tracks,
    tracksByHash: new Map(tracks.map((track) => [track.fileHash, track] as const))
  };
}

export function buildCachedLibraryTrackUpsertRecord(
  input: CacheLibraryTrackUpsertInput
): CacheLibraryTrackUpsertRecord {
  const file =
    input.file instanceof File ? input.file : toCachedLibraryFileFromBlob(input.file, input.track);
  const providerSource = resolveProviderTrackSource(input.track);
  const cacheProvider = providerSource?.provider ?? (
    input.track.sourceType === "local_upload" ||
    input.track.sourceType === "netease" ||
    input.track.sourceType === "qqmusic" ||
    input.track.sourceType === "bilibili" ||
    input.track.sourceType === "alist"
      ? input.track.sourceType
      : undefined
  );
  const providerTrackId = providerSource?.trackId ?? input.track.sourceRef?.trackId ?? null;

  return {
    fileHash: input.track.fileHash,
    title: input.track.title,
    artist: input.track.artist ?? "未知艺术家",
    ...(input.track.album !== undefined ? { album: input.track.album } : {}),
    ...(input.track.artworkUrl !== undefined ? { artworkUrl: input.track.artworkUrl } : {}),
    ...(cacheProvider
      ? {
          provider: cacheProvider,
          ...(providerTrackId ? { providerTrackId } : {})
        }
      : {}),
    ...(input.track.loudness ? { loudness: input.track.loudness } : {}),
    ...(input.track.lyrics !== undefined ? { lyrics: input.track.lyrics } : {}),
    ...(input.track.translatedLyrics !== undefined ? { translatedLyrics: input.track.translatedLyrics } : {}),
    ...(input.track.romanizedLyrics !== undefined ? { romanizedLyrics: input.track.romanizedLyrics } : {}),
    mimeType: input.track.mimeType || file.type || "audio/mpeg",
    durationMs: input.track.durationMs,
    sizeBytes: input.track.sizeBytes ?? file.size,
    file,
    sourceTrackIds: [input.track.id],
    sourceRoomIds: [input.roomId],
    lastSourceTrackId: input.track.id,
    lastSourceRoomId: input.roomId,
    lastOwnerNickname: input.track.ownerNickname ?? null
  };
}

export function buildCachedLibraryFileForReload(record: CachedLibraryTrackRecord) {
  return toCachedLibraryTrackFile(record);
}

export function createCachedLibraryTrackFileLoader(
  loadCachedTrackFile: (fileHash: string) => Promise<CachedLibraryTrackFile | null>
) {
  return createInFlightCachedLibraryTrackFileLoader(loadCachedTrackFile);
}
