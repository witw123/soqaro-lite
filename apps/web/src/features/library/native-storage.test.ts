import { afterEach, describe, expect, it, vi } from "vitest";
import { getNativeStorageDirectory } from "./native-storage";

afterEach(() => vi.unstubAllGlobals());

describe("native repository transport", () => {
  it("writes and reads audio in bounded chunks and obtains size without reading audio", async () => {
    const files = new Map<string, Uint8Array>();
    const invoke = vi.fn(async (_command: string, { request }: {
      request: { op: string; path: string; offset?: number; length?: number; data?: string; target?: string };
    }) => {
      const { op, path } = request;
      if (op === "root") return { path: "C:\\Soqaro" };
      if (op === "file" && !files.has(path)) files.set(path, new Uint8Array());
      if (op === "write") {
        const bytes = Uint8Array.from(atob(request.data!), (value) => value.charCodeAt(0));
        const previous = files.get(path)!;
        const next = new Uint8Array((request.offset ?? 0) + bytes.length);
        next.set(previous);
        next.set(bytes, request.offset);
        files.set(path, next);
      }
      if (op === "commit") {
        files.set(request.target!, files.get(path)!);
        files.delete(path);
      }
      if (op === "stat") return { entry: { size: files.get(path)!.length, modified: 1234 } };
      if (op === "read") {
        const chunk = files.get(path)!.subarray(request.offset, request.offset! + request.length!);
        return { data: Buffer.from(chunk).toString("base64") };
      }
      return {};
    });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, __TAURI__: { core: { invoke } } });
    const { handle } = await getNativeStorageDirectory();
    const repository = await handle.getDirectoryHandle(".soqaro", { create: true });
    const file = await repository.getFileHandle("audio.mp3", { create: true });
    const content = new Uint8Array(600_000).map((_, index) => index % 251);
    const writer = await file.createWritable();
    await writer.write(new Blob([content]));
    await writer.close();
    const readsBeforeStat = invoke.mock.calls.filter(([, args]) => args.request.op === "read").length;
    expect(await file.getSize!()).toBe(content.length);
    expect(invoke.mock.calls.filter(([, args]) => args.request.op === "read")).toHaveLength(readsBeforeStat);
    expect(new Uint8Array(await (await file.getFile()).arrayBuffer())).toEqual(content);
    const writes = invoke.mock.calls.filter(([, args]) => args.request.op === "write");
    expect(writes).toHaveLength(3);
    expect(writes.every(([, args]) => atob(args.request.data!).length <= 262144)).toBe(true);
    expect([...files.keys()]).toEqual([".soqaro/audio.mp3"]);
  });

  it("reports the storage root without the Windows verbatim prefix", async () => {
    const invoke = vi.fn(async () => ({ path: String.raw`\\?\E:\game\Soqaro` }));
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, __TAURI__: { core: { invoke } } });

    await expect(getNativeStorageDirectory()).resolves.toMatchObject({ name: String.raw`E:\game\Soqaro` });
  });

  it("keeps UNC storage roots addressable", async () => {
    const invoke = vi.fn(async () => ({ path: String.raw`\\?\UNC\server\share\Soqaro` }));
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {}, __TAURI__: { core: { invoke } } });

    await expect(getNativeStorageDirectory()).resolves.toMatchObject({ name: String.raw`\\server\share\Soqaro` });
  });

  it("surfaces native errors rather than changing storage roots", async () => {
    vi.stubGlobal("window", {
      __TAURI_INTERNALS__: {},
      __TAURI__: { core: { invoke: vi.fn().mockRejectedValue(new Error("Permission denied")) } }
    });
    await expect(getNativeStorageDirectory()).rejects.toThrow("Permission denied");
  });
});
