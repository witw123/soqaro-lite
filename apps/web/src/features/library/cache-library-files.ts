import type {
  CachedLibraryTrackRecord,
  CachedLibraryTrackSummaryRecord
} from "@/features/library/indexeddb";
import type {
  CachedLibraryTrack,
  CachedLibraryTrackFile
} from "@/features/library/audio-utils";
import type { TrackMeta } from "@soqaro/shared";

export function createInFlightCachedLibraryTrackFileLoader(
  loadCachedTrackFile: (fileHash: string) => Promise<CachedLibraryTrackFile | null>
) {
  const inFlightLoads = new Map<string, Promise<CachedLibraryTrackFile | null>>();

  return (fileHash: string) => {
    const existingLoad = inFlightLoads.get(fileHash);
    if (existingLoad) {
      return existingLoad;
    }

    const nextLoad = loadCachedTrackFile(fileHash).finally(() => {
      if (inFlightLoads.get(fileHash) === nextLoad) {
        inFlightLoads.delete(fileHash);
      }
    });
    inFlightLoads.set(fileHash, nextLoad);
    return nextLoad;
  };
}

export function toCachedLibraryFile(input: {
  file: Blob;
  title: string;
  mimeType: string;
  fileHash: string;
}) {
  if (input.file instanceof File) {
    return input.file;
  }

  return new File([input.file], buildCachedLibraryFileName(input), {
    type: input.mimeType || "audio/mpeg"
  });
}

export function toCachedLibraryFileFromBlob(
  file: Blob,
  track: Pick<TrackMeta, "title" | "mimeType" | "fileHash">
) {
  return toCachedLibraryFile({
    file,
    title: track.title,
    mimeType: track.mimeType || file.type || "audio/mpeg",
    fileHash: track.fileHash
  });
}

export function toCachedLibraryTrack(
  record: CachedLibraryTrackSummaryRecord
): CachedLibraryTrack {
  return {
    fileHash: record.fileHash,
    title: record.title,
    artist: record.artist,
    ...(record.album !== undefined ? { album: record.album } : {}),
    ...(record.artworkUrl !== undefined ? { artworkUrl: record.artworkUrl } : {}),
    ...(record.lyrics !== undefined ? { lyrics: record.lyrics } : {}),
    ...(record.translatedLyrics !== undefined ? { translatedLyrics: record.translatedLyrics } : {}),
    ...(record.romanizedLyrics !== undefined ? { romanizedLyrics: record.romanizedLyrics } : {}),
    ...(record.provider !== undefined ? { provider: record.provider } : {}),
    ...(record.providerTrackId !== undefined ? { providerTrackId: record.providerTrackId } : {}),
    mimeType: record.mimeType,
    durationMs: record.durationMs,
    sizeBytes: record.sizeBytes,
    ...(record.loudness ? { loudness: record.loudness } : {}),
    cachedAt: record.cachedAt,
    sourceTrackIds: record.sourceTrackIds,
    sourceRoomIds: record.sourceRoomIds,
    lastSourceTrackId: record.lastSourceTrackId,
    lastSourceRoomId: record.lastSourceRoomId,
    lastOwnerNickname: record.lastOwnerNickname
  };
}

export function toCachedLibraryTrackFile(
  record: CachedLibraryTrackRecord
): CachedLibraryTrackFile {
  return {
    ...toCachedLibraryTrack(record),
    file: toCachedLibraryFile(record)
  };
}

export function buildCachedLibraryFileName(input: {
  title: string;
  mimeType: string;
  fileHash: string;
}) {
  const baseName = sanitizeFileName(input.title) || input.fileHash;
  const extension = inferFileExtension(input.mimeType);
  return extension ? `${baseName}.${extension}` : baseName;
}

function inferFileExtension(mimeType: string | null | undefined) {
  switch ((mimeType ?? "").toLowerCase()) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/flac":
      return "flac";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/aac":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    default:
      return "";
  }
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, " ").trim();
}
