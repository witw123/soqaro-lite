import { createSHA256 } from "hash-wasm";
import {
  deleteLocalAudioFileRecord,
  deleteLocalPlaylistTrack,
  listLocalAudioFiles,
  listLocalPlaylistTracks,
  getLocalAudioDirectory,
  applyDirectoryScanIndex,
  saveLocalAudioFileRecord,
  saveLocalPlaylistDirectory,
  upsertLocalPlaylistTrack,
  type LocalPlaylistTrackRecord
} from "@/features/library/indexeddb";
import {
  chooseLocalAudioSourceDirectory,
  createFrameBudgetYielder,
  getConfiguredLocalRepository,
  listLocalAudioFilesInDirectory,
  listSelectedLocalAudioFiles
} from "@/features/library/local-audio-storage";
import { readEmbeddedAudioMetadata } from "@/features/library/audio-metadata";
import { createRepositoryTrackRecord } from "@/features/library/local-repository";
import { createLocalPlaylistSourceId } from "./local-playlist-mappers";

export const directoryScanSource = "directory-scan" as const;

let selectedDirectorySyncPromise: Promise<number> | null = null;
let selectedDirectorySyncController: AbortController | null = null;

export async function hashAudioBlob(blob: Blob, signal?: AbortSignal): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    throwIfAborted(signal);
    hasher.update(new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer()));
  }
  throwIfAborted(signal);
  return hasher.digest("hex");
}

export function inferAudioMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "flac") return "audio/flac";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a" || extension === "aac" || extension === "alac") return "audio/mp4";
  if (extension === "ogg" || extension === "opus") return "audio/ogg";
  if (extension === "ape") return "audio/ape";
  if (extension === "wma") return "audio/x-ms-wma";
  if (extension === "aif" || extension === "aiff") return "audio/aiff";
  return "audio/mpeg";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Local directory scan was cancelled.", "AbortError");
  }
}

export async function readDirectoryTrackMetadata(file: File) {
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  let parsedArtist = "本地歌曲";
  let parsedTitle = baseName;
  if (baseName.includes(" - ")) {
    const parts = baseName.split(" - ");
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      parsedArtist = parts[0].trim();
      parsedTitle = parts.slice(1).join(" - ").trim();
    }
  }

  const fallback = {
    title: parsedTitle,
    artist: parsedArtist,
    album: null as string | null,
    durationMs: 0,
    artworkUrl: null as string | null,
    lyrics: null as string | null
  };

  const metadata = await readEmbeddedAudioMetadata(file);
  return {
    title: metadata.title ?? fallback.title,
    artist: metadata.artist ?? fallback.artist,
    album: metadata.album ?? fallback.album,
    durationMs: metadata.durationMs ?? fallback.durationMs,
    artworkUrl: metadata.artworkUrl ?? fallback.artworkUrl,
    lyrics: metadata.lyrics ?? fallback.lyrics
  };
}

export function syncSelectedLocalDirectoryTracks(options?: { signal?: AbortSignal }): Promise<number> {
  if (selectedDirectorySyncPromise) return selectedDirectorySyncPromise;

  const controller = new AbortController();
  selectedDirectorySyncController = controller;
  const abortFromCaller = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const syncPromise = performSelectedLocalDirectorySync({ signal: controller.signal });
  const settledPromise = syncPromise.finally(() => {
    options?.signal?.removeEventListener("abort", abortFromCaller);
    if (selectedDirectorySyncPromise === settledPromise) {
      selectedDirectorySyncPromise = null;
      selectedDirectorySyncController = null;
    }
  });
  selectedDirectorySyncPromise = settledPromise;
  return settledPromise;
}

export function cancelSelectedLocalDirectorySync(): void {
  selectedDirectorySyncController?.abort();
  selectedDirectorySyncController = null;
  selectedDirectorySyncPromise = null;
}

export async function performSelectedLocalDirectorySync(options?: { signal?: AbortSignal }): Promise<number> {
  const directory = await getLocalAudioDirectory();
  if (!directory?.repositoryId) throw new Error("请先选择存储根目录。");
  if (directory.kind === "native") return 0;
  const yieldIfFrameBudgetExhausted = createFrameBudgetYielder();
  const selectedFiles = await listSelectedLocalAudioFiles(options);
  if (!selectedFiles) {
    throw new Error("无法读取所选本地目录，请重新授权后重试。");
  }

  const [existingTracks, existingFiles] = await Promise.all([
    listLocalPlaylistTracks(),
    listLocalAudioFiles("saved")
  ]);
  const existingByHash = new Map(
    existingTracks
      .filter((track) => !!track.fileHash)
      .map((track) => [track.fileHash!, track])
  );
  const existingByFileName = new Map(
    existingTracks
      .filter((track) => track.source === directoryScanSource && !track.sourceDirectoryId && !!track.fileName && !!track.fileHash)
      .map((track) => [track.fileName!, track])
  );
  const scanTimestamp = Date.now();

  const indexedHashes = new Set(existingFiles.map((file) => file.fileHash));
  const scannedTracks: Array<{ track: LocalPlaylistTrackRecord; fileHash: string; fileName: string; changed: boolean }> = [];
  for (const [index, { file, fileName, lastModified }] of selectedFiles.entries()) {
    throwIfAborted(options?.signal);
    try {
      const previous = existingByFileName.get(fileName);
      const previousLastModified = previous?.lastModified ?? null;
      const canReuse =
        !!previous?.fileHash &&
        previous.sizeBytes === file.size &&
        previousLastModified !== null &&
        previousLastModified === lastModified;
      const fileHash = canReuse ? previous.fileHash! : await hashAudioBlob(file, options?.signal);
      const existing = existingByHash.get(fileHash) ?? previous;
      const metadata = canReuse
        ? {
            title: previous.title,
            artist: previous.artist,
            album: previous.album,
            durationMs: previous.durationMs,
            artworkUrl: previous.artworkUrl,
            lyrics: previous.lyrics
          }
        : await readDirectoryTrackMetadata(file);
      // IndexedDB returns tracks by updatedAt descending, so earlier scan entries get later timestamps.
      const now = canReuse ? previous.updatedAt : new Date(scanTimestamp - index).toISOString();
      scannedTracks.push({
        track: {
          id: `local-file:${fileHash}`,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          durationMs: metadata.durationMs,
          mimeType: file.type || inferAudioMimeType(file.name),
          sizeBytes: file.size,
          artworkUrl: metadata.artworkUrl,
          lyrics: metadata.lyrics,
          provider: "local_upload" as const,
          providerTrackId: null,
          fileHash,
          fileName,
          lastModified,
          availableOffline: true,
          source: directoryScanSource,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        } satisfies LocalPlaylistTrackRecord,
        fileHash,
        fileName,
        changed: !canReuse || !indexedHashes.has(fileHash)
      });
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      // Skip corrupt or unreadable audio file and continue with the rest
    }
    await yieldIfFrameBudgetExhausted();
  }

  const currentHashes = new Set(scannedTracks.map((item) => item.fileHash));
  throwIfAborted(options?.signal);
  if ((await getLocalAudioDirectory())?.repositoryId !== directory.repositoryId) {
    throw new Error("扫描期间根目录已改变，请重新扫描。");
  }
  const staleTracks = existingTracks.filter(
    (track) => track.source === directoryScanSource && !track.sourceDirectoryId && !!track.fileHash && !currentHashes.has(track.fileHash)
  );
  const staleFiles = existingFiles.filter(
    (file) => file.source === directoryScanSource && !file.sourceDirectoryId && !currentHashes.has(file.fileHash)
  );

  const repository = await getConfiguredLocalRepository();
  if (repository) {
    const repositoryTracks = await repository.listTracks();
    const staleRepositoryTracks = repositoryTracks.filter(
      (track) =>
        track.retention === "library" &&
        track.source.kind === "external" &&
        !!track.source.relativePath &&
        !currentHashes.has(track.fileHash)
    );
    for (const track of staleRepositoryTracks) {
      throwIfAborted(options?.signal);
      await repository.deleteTrack(track.fileHash, { touchManifest: false });
    }
    const repositoryHashes = new Set(repositoryTracks.map((track) => track.fileHash));
    for (const { track, fileName } of scannedTracks.filter((item) => item.changed || !repositoryHashes.has(item.fileHash))) {
      throwIfAborted(options?.signal);
      await repository.writeTrack(
        createRepositoryTrackRecord({
          fileHash: track.fileHash!,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artworkUrl,
          lyrics: track.lyrics,
          provider: track.provider,
          mimeType: track.mimeType,
          durationMs: track.durationMs,
          sizeBytes: track.sizeBytes,
          source: {
            kind: "external",
            relativePath: fileName,
            sizeBytes: track.sizeBytes,
            lastModified: track.lastModified
          },
          retention: "library",
          createdAt: track.createdAt
        }),
        { touchManifest: false }
      );
    }
    if (staleRepositoryTracks.length || scannedTracks.some((item) => item.changed || !repositoryHashes.has(item.fileHash))) {
      await repository.touch();
    }
  }
  throwIfAborted(options?.signal);
  await applyDirectoryScanIndex({
    repositoryId: directory.repositoryId,
    tracks: scannedTracks.filter((item) => item.changed).map((item) => item.track),
    staleTrackIds: staleTracks.map((track) => track.id),
    staleFileHashes: staleFiles.map((file) => file.fileHash)
  });

  return scannedTracks.length;
}

export async function importLocalPlaylistDirectoryTracks(existingSourceDirectoryId?: string | null) {
  const yieldIfFrameBudgetExhausted = createFrameBudgetYielder();
  const directory = await chooseLocalAudioSourceDirectory();
  const selectedFiles = await listLocalAudioFilesInDirectory(directory);
  if (!selectedFiles) {
    throw new Error("无法读取所选本地目录，请重新授权后重试。");
  }

  const sourceDirectoryId = existingSourceDirectoryId || createLocalPlaylistSourceId();
  const [existingTracks, existingFiles] = await Promise.all([
    listLocalPlaylistTracks(),
    listLocalAudioFiles("saved")
  ]);
  const previousByPath = new Map(existingTracks
    .filter((track) => track.sourceDirectoryId === sourceDirectoryId)
    .map((track) => [track.fileName, track]));
  await saveLocalPlaylistDirectory({
    id: sourceDirectoryId,
    handle: directory,
    name: directory.name
  });

  const selectedFilesWithHashes: Array<(typeof selectedFiles)[number] & { fileHash: string; previous?: LocalPlaylistTrackRecord }> = [];
  for (const entry of selectedFiles) {
    const previous = previousByPath.get(entry.fileName);
    const unchanged = previous?.fileHash && previous.sizeBytes === entry.file.size && previous.lastModified === entry.lastModified;
    const fileHash = unchanged ? previous.fileHash! : await hashAudioBlob(entry.file);
    selectedFilesWithHashes.push({ ...entry, fileHash, previous: unchanged ? previous : undefined });
    await yieldIfFrameBudgetExhausted();
  }
  const currentHashes = new Set(selectedFilesWithHashes.map((entry) => entry.fileHash));
  const staleFileHashes = new Set(
    existingFiles
      .filter((file) => file.sourceDirectoryId === sourceDirectoryId && !currentHashes.has(file.fileHash))
      .map((file) => file.fileHash)
  );
  const sharedStaleFileHashes = new Set(
    existingTracks
      .filter(
        (track) =>
          !!track.fileHash &&
          staleFileHashes.has(track.fileHash) &&
          track.sourceDirectoryId !== sourceDirectoryId
      )
      .map((track) => track.fileHash!)
  );
  await Promise.all([
    ...existingTracks
      .filter(
        (track) =>
          track.sourceDirectoryId === sourceDirectoryId &&
          !!track.fileHash &&
          !currentHashes.has(track.fileHash)
      )
      .map((track) => deleteLocalPlaylistTrack(track.id)),
    ...existingFiles
      .filter(
        (file) =>
          file.sourceDirectoryId === sourceDirectoryId &&
          !currentHashes.has(file.fileHash) &&
          !sharedStaleFileHashes.has(file.fileHash)
      )
      .map((file) => deleteLocalAudioFileRecord(file.fileHash, "saved"))
  ]);

  const importedTracks: LocalPlaylistTrackRecord[] = [];
  for (const { file, fileName, fileHash, lastModified, previous } of selectedFilesWithHashes) {
    if (previous) {
      importedTracks.push(previous);
      continue;
    }
    const metadata = await readDirectoryTrackMetadata(file);
    const mimeType = file.type || inferAudioMimeType(file.name);
    const now = new Date().toISOString();
    const track: LocalPlaylistTrackRecord = {
      id: `local-file:${sourceDirectoryId}:${fileHash}`,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      durationMs: metadata.durationMs,
      mimeType,
      sizeBytes: file.size,
      artworkUrl: metadata.artworkUrl,
      lyrics: metadata.lyrics,
      provider: "local_upload",
      providerTrackId: null,
      fileHash,
      fileName,
      lastModified,
      sourceDirectoryId,
      availableOffline: true,
      createdAt: now,
      updatedAt: now
    };
    await saveLocalAudioFileRecord({
      fileHash,
      sizeBytes: file.size,
      fileName,
      lastModified,
      storageKind: "saved",
      sourceDirectoryId
    });
    await upsertLocalPlaylistTrack(track);
    importedTracks.push(track);
    await yieldIfFrameBudgetExhausted();
  }
  return {
    sourceDirectoryId,
    directoryName: directory.name,
    tracks: importedTracks
  };
}
