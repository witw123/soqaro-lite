import type {
  RepositoryDirectoryHandle as FileSystemDirectoryHandle,
  RepositoryFileHandle as FileSystemFileHandle
} from "./directory-handle";
import { hasNativeStorage } from "./native-storage";

export type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<globalThis.FileSystemDirectoryHandle>;
};

export type PermissionedDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

export type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

export type LocalAudioStorageState = {
  supported: boolean;
  fixedRoot?: boolean;
  directoryName: string | null;
  savedFileHashes: string[];
  cachedFileHashes: string[];
  permission: PermissionState | null;
};

export type LocalAudioCacheStats = {
  fileCount: number;
  bytes: number;
};

export type LocalAudioStorageStats = {
  cache: LocalAudioCacheStats;
  saved: LocalAudioCacheStats;
  other: LocalAudioCacheStats;
};

export const localOtherFilePrefixes = [
  ".soqaro/library/artwork/",
  ".soqaro/library/lyrics/",
  ".soqaro/cache/artwork/",
  ".soqaro/cache/previews/"
];

export type SelectedLocalAudioFile = {
  file: File;
  fileName: string;
  lastModified: number;
};

export function supportsLocalAudioDirectory() {
  return (
    typeof window !== "undefined" &&
    !hasNativeStorage() &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
  );
}

export function isLocalOtherFile(relativePath: string) {
  return localOtherFilePrefixes.some((prefix) => relativePath.startsWith(prefix));
}

export function downloadAudioFile(file: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, " ").trim();
}

export function inferFileExtension(mimeType: string) {
  const normalized = normalizeLocalAudioMimeType(mimeType) || mimeType.toLowerCase();
  switch (normalized) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/flac":
      return "flac";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
    case "audio/aac":
    case "video/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/webm":
    case "video/webm":
      return "webm";
    default:
      return "";
  }
}

export function buildLocalAudioFileName(input: {
  title: string;
  mimeType: string;
  fileHash: string;
}) {
  const baseName = sanitizeFileName(input.title) || input.fileHash;
  const extension = inferFileExtension(input.mimeType);
  const suffix = input.fileHash.slice(0, 8);
  return `${baseName} [${suffix}]${extension ? `.${extension}` : ""}`;
}

export function normalizeLocalAudioMimeType(value: string | undefined) {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "video/mp4" || type === "audio/x-m4a" || type === "audio/m4a") return "audio/mp4";
  if (!type?.startsWith("audio/")) return "audio/mpeg";
  if (type === "audio/x-flac") return "audio/flac";
  if (type === "audio/mp3") return "audio/mpeg";
  return type;
}

export async function requestDirectoryPermission(
  handle: PermissionedDirectoryHandle,
  mode: "read" | "readwrite"
) {
  if (typeof handle.queryPermission !== "function") {
    return true;
  }
  const current = await handle.queryPermission({ mode }).catch(() => "denied" as PermissionState);
  if (current === "granted") {
    return true;
  }
  const requested = await handle.requestPermission({ mode }).catch(() => "denied" as PermissionState);
  return requested === "granted";
}

export async function hasDirectoryReadPermission(handle: FileSystemDirectoryHandle) {
  return (
    (await asPermissionedHandle(handle)
      .queryPermission({ mode: "read" })
      .catch(() => "denied" as PermissionState)) === "granted"
  );
}

export function asPermissionedHandle(handle: FileSystemDirectoryHandle): PermissionedDirectoryHandle {
  const permHandle = handle as PermissionedDirectoryHandle;
  if (typeof permHandle.queryPermission !== "function") {
    permHandle.queryPermission = async () => "granted";
  }
  if (typeof permHandle.requestPermission !== "function") {
    permHandle.requestPermission = async () => "granted";
  }
  return permHandle;
}

export function yieldToBrowser() {
  // `globalThis`, not `window`: the frame-budget yielder below can trip this
  // from the node test environment, where `window` does not exist.
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

/**
 * Crossing a macrotask boundary is not free: once the browser notices nested
 * `setTimeout(0)` it clamps it to ~4ms, so yielding on every item of a large
 * directory walk spends seconds of wall clock doing nothing. Yield only after a
 * frame's worth of work has accumulated — still frequent enough to keep the
 * main thread responsive, rare enough to stay off the clamp.
 *
 * `scheduler.yield()` resumes at the front of the queue instead of behind
 * pending timers, so prefer it where the browser has it.
 */
export function createFrameBudgetYielder(budgetMs = 14) {
  let lastYieldAt = performance.now();
  return async function yieldIfFrameBudgetExhausted() {
    if (performance.now() - lastYieldAt < budgetMs) return;
    lastYieldAt = performance.now();
    const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (typeof scheduler?.yield === "function") {
      await scheduler.yield();
      return;
    }
    await yieldToBrowser();
  };
}

/**
 * Matches `resolveEncodingConcurrency`: leave one core for the main thread and
 * cap the fan-out so a large library cannot queue hundreds of OPFS requests.
 */
export function resolveLocalFileConcurrency(count: number, hardwareConcurrency =
  typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency) {
  if (!Number.isFinite(count) || count <= 0) return 1;
  const availableWorkers = Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.floor(hardwareConcurrency) - 1)
    : 2;
  return Math.min(count, 4, availableWorkers);
}

/**
 * Runs `worker` over `items` with a bounded number in flight, in the same
 * worker-pool shape as the repository's playback-unit writer. Rejections
 * propagate as they would from a sequential loop; callers that tolerate a bad
 * item should catch inside `worker`.
 */
export async function forEachWithConcurrency<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  if (items.length === 0) return;
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        await worker(items[index]!, index);
      }
    })
  );
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(aac|aif|aiff|alac|ape|dsd|dsf|dff|flac|m4a|mka|mp3|ogg|opus|wav|webm|wma)$/i.test(file.name);
}

export function splitLocalPath(fileName: string) {
  const normalized = fileName.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error("本地文件路径必须是相对路径。");
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\0"))) {
    throw new Error("本地文件路径包含非法片段。");
  }
  return parts;
}

export async function getFileByPath(root: FileSystemDirectoryHandle, fileName: string) {
  const parts = splitLocalPath(fileName);
  if (parts.length === 0) {
    throw new Error("本地文件路径为空。");
  }

  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part);
  }
  return directory.getFileHandle(parts[parts.length - 1]).then((handle) => handle.getFile());
}
