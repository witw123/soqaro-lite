"use client";

import type {
  RoomSnapshot,
  TrackLoudness,
  TrackMeta
} from "@soqaro/shared";
import {
  deleteCachedLibraryTrackFile,
  getCachedLibraryTrack,
  upsertCachedLibraryTrack
} from "@/features/library/indexeddb";
import {
  soqaroApi,
  resolveDownloadedAudioMimeType
} from "@/lib/network/soqaro-api";
import { saveCachedAudioFileToLocalDirectory } from "@/features/library/local-audio-storage";
import {
  buildCachedLibraryTrackUpsertRecord,
  notifyCacheLibraryChanged
} from "@/features/library/cache-library";
import { providerDisplayName } from "@/lib/domain/provider-labels";
import { resolveProviderTrackSource } from "@/features/library/provider-track-identity";
import { extensionForImportedMimeType } from "@/features/upload/upload-import-helpers";
import { analyzeAudioBlobLoudness } from "./loudness";

export type OfflineProviderSource = {
  provider: "netease" | "qqmusic" | "bilibili" | "alist";
  trackId: string;
  label: string;
};

type OfflineFallbackResult = {
  fileHash: string;
  file: File | null;
  loudness?: TrackLoudness;
};

const inFlightFallbackImports = new Map<
  string,
  Promise<OfflineFallbackResult>
>();

export function resolveOfflineProviderSource(input: {
  roomSnapshot: RoomSnapshot | null | undefined;
  track: TrackMeta | null | undefined;
  forceProviderCache?: boolean;
}) {
  const { roomSnapshot, track } = input;
  const playback = roomSnapshot?.room.playback;
  if (
    !track ||
    !playback ||
    playback.status !== "playing" ||
    playback.currentTrackId !== track.id
  ) {
    return null;
  }

  if (!input.forceProviderCache) {
    const sourceSessionId = playback.sourceSessionId ?? track.ownerSessionId;
    const sourceMember = roomSnapshot.room.members.find(
      (member) => member.id === sourceSessionId
    );
    if (sourceMember && sourceMember.presenceState !== "offline") {
      return null;
    }
  }

  const providerSource = resolveProviderTrackSource(track);
  if (!providerSource) {
    return null;
  }

  return {
    provider: providerSource.provider,
    trackId: providerSource.trackId,
    label: providerDisplayName(providerSource.provider)
  } satisfies OfflineProviderSource;
}

export async function ensureOfflineProviderPlaybackAsset(input: {
  roomSnapshot: RoomSnapshot;
  track: TrackMeta;
  source: OfflineProviderSource;
  forceDownload?: boolean;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}) {
  const importKey = `${input.roomSnapshot.room.id}:${input.track.id}:${input.source.provider}:${input.source.trackId}`;
  const existing = inFlightFallbackImports.get(importKey);
  if (existing) {
    return existing;
  }

  // This operation is shared across render/effect lifetimes. A room snapshot
  // refresh can dispose the caller that started it, but that must not abort a
  // download which is still useful cache for the next render or next room
  // visit. The caller's cancelled flag still prevents stale state updates.
  const operation = importOfflineProviderTrack({
    ...input,
    onStatus: undefined,
    signal: undefined
  });
  inFlightFallbackImports.set(importKey, operation);
  const sharedOperation = operation.finally(() => {
    if (inFlightFallbackImports.get(importKey) === sharedOperation) {
      inFlightFallbackImports.delete(importKey);
    }
  });
  inFlightFallbackImports.set(importKey, sharedOperation);
  return sharedOperation;
}

async function importOfflineProviderTrack(input: {
  roomSnapshot: RoomSnapshot;
  track: TrackMeta;
  source: OfflineProviderSource;
  forceDownload?: boolean;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<OfflineFallbackResult> {
  const {
    roomSnapshot,
    track,
    source,
    onStatus,
    signal
  } = input;

  try {
    onStatus?.(input.forceDownload
      ? `正在从${source.label}下载并缓存《${track.title}》…`
      : `成员不在线，正在从${source.label}下载并缓存《${track.title}》…`);
    const downloaded =
      source.provider === "netease"
        ? await soqaroApi.downloadNeteaseTrack(source.trackId, "exhigh", signal)
        : source.provider === "qqmusic"
        ? await soqaroApi.downloadQqMusicTrack(source.trackId, "exhigh", signal)
        : source.provider === "bilibili"
        ? await soqaroApi.downloadBilibiliTrack(source.trackId, signal)
        : await fetch(soqaroApi.getAlistStreamUrl(source.trackId), { signal }).then(async (res) => ({
            blob: await res.blob(),
            contentType: res.headers.get("content-type") ?? "audio/mpeg"
          }));
    const mimeType = await resolveDownloadedAudioMimeType(
      downloaded.blob,
      downloaded.contentType
    );
    const extension = extensionForImportedMimeType(mimeType);
    const file = new File(
      [downloaded.blob],
      `${sanitizeFileName(track.title) || source.provider}-fallback.${extension}`,
      { type: mimeType }
    );

    const providerLyrics = track.lyrics?.trim()
      ? null
      : await resolveProviderLyrics(source).catch(() => null);
    const lyrics = track.lyrics?.trim() || providerLyrics?.wordSyncedLyric || providerLyrics?.plainLyric || null;
    const loudness = track.loudness ?? null;
    if (!track.loudness) {
      void analyzeAudioBlobLoudness(file).then((result) => {
        if (result) {
          getCachedLibraryTrack(track.fileHash).then((record) => {
            if (record) {
              upsertCachedLibraryTrack({ ...record, loudness: result });
            }
          }).catch(() => undefined);
        }
      }).catch(() => undefined);
    }
    // The room track already owns its content hash. Avoid decoding or creating
    // playback segments here: the downloaded provider file is the local source.
    await upsertCachedLibraryTrack(
      buildCachedLibraryTrackUpsertRecord({
        roomId: roomSnapshot.room.id,
        file,
        track: {
          ...track,
          fileHash: track.fileHash,
          sizeBytes: file.size,
          mimeType,
          lyrics: lyrics || null,
          translatedLyrics: providerLyrics?.translatedLyric ?? null,
          romanizedLyrics: providerLyrics?.romanizedLyric ?? null,
          ...(loudness ? { loudness } : {})
        }
      })
    );

    // Keep the browser cache when no local repository is set. If one exists,
    // this moves the source file into its cache/provider directory. This is
    // still disposable cache storage, never the formal local library.
    // Do not make playback wait for repository metadata, artwork, or a slow
    // File System Access write. The IndexedDB copy is already durable, and
    // the returned File can start at the room clock position immediately.
    void saveCachedAudioFileToLocalDirectory({
      file,
      fileHash: track.fileHash,
      title: track.title,
      mimeType,
      provider: source.provider,
      // A provider fallback is a fresh source for the room track. Reusing an
      // older cache entry here could leave the local path pointing at a
      // truncated or stale download while the returned File plays correctly.
      reuseExisting: false
    }).then(async (saved) => {
      if (saved) {
        await deleteCachedLibraryTrackFile(track.fileHash).catch(() => undefined);
      }
    }).catch(() => undefined);
    notifyCacheLibraryChanged();

    onStatus?.(input.forceDownload
      ? `已从${source.label}缓存《${track.title}》，正在使用缓存音频播放。`
      : `成员不在线，已从${source.label}缓存《${track.title}》，正在使用缓存音频播放。`);
    return {
      fileHash: track.fileHash,
      file,
      ...(loudness ? { loudness } : {})
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    onStatus?.(`成员不在线，${source.label}下载失败，已回退到流式播放。`);
    return {
      fileHash: track.fileHash,
      file: null,
      ...(track.loudness ? { loudness: track.loudness } : {})
    };
  }
}

async function resolveProviderLyrics(source: OfflineProviderSource) {
  if (source.provider !== "netease" && source.provider !== "qqmusic") {
    return null;
  }
  try {
    const response = source.provider === "netease"
      ? await soqaroApi.getNeteaseLyrics(source.trackId)
      : await soqaroApi.getQqMusicLyrics(source.trackId);
    return response;
  } catch {
    return null;
  }
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, " ").trim();
}
