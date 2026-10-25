// The repository only needs this subset of File System Access. Browser handles
// implement it directly; native shells implement it against their fixed root.
export interface RepositoryFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  getSize?(): Promise<number>;
  createWritable(): Promise<{
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

export interface RepositoryDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<RepositoryDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<RepositoryFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values?(): AsyncIterableIterator<RepositoryDirectoryHandle | RepositoryFileHandle>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}
