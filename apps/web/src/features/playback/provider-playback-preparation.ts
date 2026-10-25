import {
  getLocalAudioFileRecord,
  listLocalPlaylistTracks,
  type LocalPlaylistTrackRecord
} from "@/features/library/indexeddb";
import {
  toCachedProviderTrack,
  toProviderTrackRecord,
  type ProviderTrack
} from "@/features/playlist/local-playlist";
import {
  cacheProviderTrackForPlayback,
  findCachedProviderPlaybackRecord,
  hasProviderTrackPlaybackCache
} from "./provider-track-cache";

/**
 * Where the audio for a prepared track came from:
 * - `saved-library`: explicitly downloaded into the user's local audio directory.
 * - `playback-cache`: reusable entry of the disposable playback cache.
 * - `playback-download`: freshly downloaded into the disposable playback cache.
 */
export type PreparedPlaybackSource = "saved-library" | "playback-cache" | "playback-download";

export type PreparedPlaybackTrack = {
  record: LocalPlaylistTrackRecord;
  source: PreparedPlaybackSource;
};

export type PlaybackPreparationErrorCode =
  | "missing-audio-source"
  | "preparation-failed";

export class PlaybackPreparationError extends Error {
  readonly code: PlaybackPreparationErrorCode;

  constructor(code: PlaybackPreparationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlaybackPreparationError";
    this.code = code;
  }
}

export function isProviderTrackInput(
  input: ProviderTrack | LocalPlaylistTrackRecord
): input is ProviderTrack {
  return "access" in input;
}

function isProviderBackedRecord(
  record: LocalPlaylistTrackRecord
): record is LocalPlaylistTrackRecord & {
  provider: "netease" | "qqmusic" | "bilibili" | "alist";
  providerTrackId: string;
} {
  return (
    (record.provider === "netease" ||
      record.provider === "qqmusic" ||
      record.provider === "bilibili" ||
      record.provider === "alist") &&
    !!record.providerTrackId
  );
}

function toProviderTrackView(
  input: ProviderTrack | LocalPlaylistTrackRecord
): ProviderTrack | null {
  if (isProviderTrackInput(input)) return input;
  return toCachedProviderTrack(input);
}

function preparationKeyFor(input: ProviderTrack | LocalPlaylistTrackRecord): string {
  if (isProviderTrackInput(input) || isProviderBackedRecord(input)) {
    return `provider:${input.provider}:${input.providerTrackId}`;
  }
  return input.fileHash ? `local:${input.fileHash}` : `record:${input.id}`;
}

// Concurrent clicks on the same track (row + "play all", double click, ...) must
// share one download instead of racing each other.
type Preparation = {
  controller: AbortController;
  promise: Promise<PreparedPlaybackTrack>;
  consumers: number;
};
const inflightPreparations = new Map<string, Preparation>();
let foregroundPreparations = 0;
const foregroundListeners = new Set<() => void>();

export function hasForegroundPlaybackPreparation() {
  return foregroundPreparations > 0;
}

export function subscribeForegroundPlaybackPreparation(listener: () => void) {
  foregroundListeners.add(listener);
  return () => { foregroundListeners.delete(listener); };
}

function notifyForegroundListeners() {
  for (const listener of foregroundListeners) listener();
}

/**
 * Unified entry point used by every "click to play" path (discover page,
 * network playlists, favorites, search results). Resolution order:
 *
 * 1. explicitly saved local file (user's local audio directory);
 * 2. persistent playback cache (disposable, may be cleaned up automatically);
 * 3. provider download into the playback cache - never into the saved library.
 *
 * The returned record always carries a `fileHash`, so `LocalPlayerProvider`
 * can resolve the audio blob and start playback immediately.
 */
export async function prepareTrackForImmediatePlayback(
  input: ProviderTrack | LocalPlaylistTrackRecord,
  options: { signal?: AbortSignal; background?: boolean } = {}
): Promise<PreparedPlaybackTrack> {
  const { signal, background = false } = options;
  signal?.throwIfAborted();
  const key = preparationKeyFor(input);
  let entry = inflightPreparations.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const created: Preparation = {
      controller,
      consumers: 0,
      promise: runPreparation(input, controller.signal).finally(() => {
        if (inflightPreparations.get(key) === created) inflightPreparations.delete(key);
      })
    };
    entry = created;
    inflightPreparations.set(key, entry);
  }

  // A foreground click can take over an in-flight prefetch. Cancelling the
  // prefetch subscriber must not cancel the download still needed by the click.
  entry.consumers += 1;
  const activeEntry = entry;
  let onAbort: (() => void) | undefined;
  const result = new Promise<PreparedPlaybackTrack>((resolve, reject) => {
    onAbort = () => reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    activeEntry.promise.then(resolve, reject);
  });
  if (!background) {
    foregroundPreparations += 1;
    notifyForegroundListeners();
  }
  try {
    const prepared = await result;
    return isProviderTrackInput(input)
      ? prepared
      : { ...prepared, record: { ...prepared.record, id: input.id } };
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    activeEntry.consumers -= 1;
    if (activeEntry.consumers === 0) activeEntry.controller.abort();
    if (!background) {
      foregroundPreparations -= 1;
      notifyForegroundListeners();
    }
  }
}

async function runPreparation(
  input: ProviderTrack | LocalPlaylistTrackRecord,
  signal: AbortSignal
): Promise<PreparedPlaybackTrack> {
  // 1) The record itself is an explicitly saved local file.
  if (!isProviderTrackInput(input) && input.availableOffline && input.fileHash) {
    return { record: input, source: "saved-library" };
  }

  // 2) The record already points at a living playback-cache entry.
  if (
    !isProviderTrackInput(input) &&
    !isProviderBackedRecord(input) &&
    input.fileHash &&
    (await hasProviderTrackPlaybackCache(input.fileHash).catch(() => false))
  ) {
    return { record: input, source: "playback-cache" };
  }

  // 3) A saved copy exists in the local audio directory (resolves bare
  //    provider candidates against the library, and repairs stale
  //    availability flags on persisted rows).
  const savedRecord = await findSavedLibraryRecord(input);
  if (savedRecord) return { record: savedRecord, source: "saved-library" };

  // 4) Reusable playback-cache entry.
  const providerTrack = toProviderTrackView(input);
  signal.throwIfAborted();
  if (providerTrack) {
    const cachedRecord = await findCachedProviderPlaybackRecord(providerTrack).catch(() => null);
    if (cachedRecord) return { record: cachedRecord, source: "playback-cache" };
  }

  // 5) B 站音轨支持流式直出：无需阻塞等待全量下载，立即返回音轨记录供原生流式播放
  if (providerTrack?.provider === "bilibili") {
    const streamRecord = toProviderTrackRecord(providerTrack);
    return { record: streamRecord, source: "playback-download" };
  }

  // 6) Download into the playback cache.
  if (!providerTrack) {
    throw new PlaybackPreparationError(
      "missing-audio-source",
      `《${input.title}》没有可用的播放音频，请先下载到本地后播放。`
    );
  }
  try {
    signal.throwIfAborted();
    const record = await cacheProviderTrackForPlayback(providerTrack, signal);
    return { record, source: "playback-download" };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof PlaybackPreparationError) throw error;
    throw new PlaybackPreparationError("preparation-failed", toPreparationFailureMessage(error), {
      cause: error
    });
  }
}

async function findSavedLibraryRecord(
  input: ProviderTrack | LocalPlaylistTrackRecord
): Promise<LocalPlaylistTrackRecord | null> {
  const explicitTracks = await listLocalPlaylistTracks().catch(() => []);
  const matched = explicitTracks.find((candidate) => {
    if (isProviderTrackInput(input)) {
      return candidate.provider === input.provider &&
        candidate.providerTrackId === input.providerTrackId;
    }
    if (isProviderBackedRecord(input)) {
      return candidate.provider === input.provider &&
        candidate.providerTrackId === input.providerTrackId;
    }
    return candidate.id === input.id ||
      (!!input.fileHash && candidate.fileHash === input.fileHash);
  });
  if (!matched?.fileHash) return null;
  if (matched.availableOffline) return matched;

  // Persisted rows can carry stale availability flags; only treat the track
  // as saved when the managed library really holds the file.
  const savedFile = await getLocalAudioFileRecord(matched.fileHash, "saved").catch(() => null);
  return savedFile ? { ...matched, availableOffline: true } : null;
}

/** User-facing message describing what "play" did with the audio. */
export function buildPlaybackStatusMessage(title: string, source: PreparedPlaybackSource): string {
  switch (source) {
    case "saved-library":
      return `正在播放《${title}》`;
    case "playback-cache":
      return `正在播放《${title}》，已使用播放缓存（播放缓存可能会被自动清理）。`;
    case "playback-download":
      return `正在播放《${title}》，音频已写入播放缓存（播放缓存可能会被自动清理）。`;
  }
}

export function toPlaybackPreparationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof PlaybackPreparationError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

function toPreparationFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "音频准备失败，请稍后重试。";
}
