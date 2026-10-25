import { capacitorPlugin, isCapacitorRuntime, isTauriRuntime } from "@/lib/desktop/tauri";
import type { RepositoryDirectoryHandle, RepositoryFileHandle } from "./directory-handle";

type Entry = { name: string; kind: "file" | "directory"; size: number; modified: number };
type StorageReply = {
  path?: string;
  entry?: Entry;
  entries?: Entry[];
  data?: string;
};
const chunkSize = 256 * 1024;

export function hasNativeStorage() {
  return isTauriRuntime() || isCapacitorRuntime();
}

async function storage(op: string, path = "", extra: Record<string, unknown> = {}): Promise<StorageReply> {
  const request = { op, path, ...extra };
  try {
    if (isTauriRuntime()) {
      const win = window as unknown as {
        __TAURI__?: {
          core?: { invoke?: (command: string, args?: unknown) => Promise<StorageReply> };
          invoke?: (command: string, args?: unknown) => Promise<StorageReply>;
        };
        __TAURI_INTERNALS__?: {
          invoke?: (command: string, args?: unknown) => Promise<StorageReply>;
        };
      };
      const invoke =
        win.__TAURI__?.core?.invoke ??
        win.__TAURI__?.invoke ??
        win.__TAURI_INTERNALS__?.invoke;
      if (!invoke) throw new Error("桌面存储接口不可用，请更新客户端。");
      return await invoke("local_storage", { request });
    }
    const plugin = capacitorPlugin("LocalStorage");
    if (!plugin?.execute) throw new Error("原生存储接口不可用，请更新客户端。");
    return await plugin.execute(request) as StorageReply;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message === "Directory not found" || message === "File not found") {
      throw new DOMException(message, "NotFoundError");
    }
    throw cause instanceof Error ? cause : new Error(message);
  }
}

function childPath(parent: string, name: string) {
  if (!name || /[/\\:\0]/.test(name) || name === "." || name === "..") {
    throw new Error("无效的仓库文件名。");
  }
  return parent ? `${parent}/${name}` : name;
}

class NativeFile implements RepositoryFileHandle {
  readonly kind = "file" as const;
  constructor(readonly name: string, private readonly path: string) {}
  async getSize() {
    return (await storage("stat", this.path)).entry!.size;
  }
  async getFile() {
    const entry = (await storage("stat", this.path)).entry!;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < entry.size; offset += chunkSize) {
      const { data } = await storage("read", this.path, { offset, length: chunkSize });
      const binary = atob(data!);
      chunks.push(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    }
    return new File(chunks, this.name, { lastModified: entry.modified });
  }
  async createWritable() {
    const temporary = `${this.path}.writing-${crypto.randomUUID()}`;
    await storage("file", temporary, { create: true });
    return {
      write: async (data: Blob | string) => {
        const blob = typeof data === "string" ? new Blob([data]) : data;
        for (let offset = 0; offset < blob.size; offset += chunkSize) {
          const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
          let binary = "";
          for (let index = 0; index < bytes.length; index += 8192) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
          }
          await storage("write", temporary, { offset, data: btoa(binary) });
        }
      },
      close: async () => { await storage("commit", temporary, { target: this.path }); },
      abort: async () => { await storage("remove", temporary); }
    };
  }
}

class NativeDirectory implements RepositoryDirectoryHandle {
  readonly kind = "directory" as const;
  constructor(readonly name: string, private readonly path: string) {}
  async queryPermission(): Promise<PermissionState> { return "granted"; }
  async requestPermission(): Promise<PermissionState> { return "granted"; }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = childPath(this.path, name);
    await storage("directory", path, { create: options?.create ?? false });
    return new NativeDirectory(name, path);
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const path = childPath(this.path, name);
    await storage("file", path, { create: options?.create ?? false });
    return new NativeFile(name, path);
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    await storage("remove", childPath(this.path, name), { recursive: options?.recursive ?? false });
  }
  async *values() {
    // Never scan executables or other installation files as music sources.
    const entries = this.path ? (await storage("list", this.path)).entries! : [];
    for (const entry of entries) {
      const path = childPath(this.path, entry.name);
      yield entry.kind === "directory"
        ? new NativeDirectory(entry.name, path)
        : new NativeFile(entry.name, path);
    }
  }
}

const verbatimPathPrefix = "\\\\?\\";
const verbatimUncPathPrefix = "\\\\?\\UNC\\";

/**
 * Windows reports the root in the verbatim form `\\?\E:\game\Soqaro`,
 * because that is what `canonicalize()` returns. The prefix is a Win32
 * long-path detail the user never typed and it only makes the root unreadable
 * wherever we show it, so the reported name drops it. Paths handed back to the
 * native layer keep the form the native side gave us.
 */
function formatStorageRootName(path: string) {
  if (path.startsWith(verbatimUncPathPrefix)) return `\\\\${path.slice(verbatimUncPathPrefix.length)}`;
  if (path.startsWith(verbatimPathPrefix)) return path.slice(verbatimPathPrefix.length);
  return path;
}

export async function getNativeStorageDirectory() {
  const { path } = await storage("root");
  if (!path) throw new Error("无法确定应用存储根目录。");
  return { handle: new NativeDirectory(path, ""), name: formatStorageRootName(path) };
}
