import { describe, expect, it, vi } from "vitest";
import { buildTrackMeta, captureAudioStream, getCapturedAudioStreamMode } from "./audio-utils";

describe("captureAudioStream", () => {
  it("reuses the native captureStream result for the same audio element", () => {
    const stream = {
      getAudioTracks: () => []
    } as unknown as MediaStream;
    const captureStream = vi.fn(() => stream);
    const audio = {
      captureStream
    } as unknown as HTMLAudioElement;

    const first = captureAudioStream(audio);
    const second = captureAudioStream(audio);

    expect(first).toBe(stream);
    expect(second).toBe(stream);
    expect(captureStream).toHaveBeenCalledTimes(1);
    expect(getCapturedAudioStreamMode(audio)).toBe("native");
  });

  it("falls back to null instead of throwing when media capture APIs fail", () => {
    const audio = {
      captureStream: vi.fn(() => {
        throw new DOMException("capture failed", "InvalidStateError");
      })
    } as unknown as HTMLAudioElement;

    expect(captureAudioStream(audio)).toBeNull();
  });

  it("rebuilds the cached capture stream when forceRefresh is requested", () => {
    const firstStream = {
      getAudioTracks: () => [],
      getTracks: () => []
    } as unknown as MediaStream;
    const secondStream = {
      getAudioTracks: () => [],
      getTracks: () => []
    } as unknown as MediaStream;
    const captureStream = vi
      .fn<() => MediaStream>()
      .mockReturnValueOnce(firstStream)
      .mockReturnValueOnce(secondStream);
    const audio = {
      captureStream
    } as unknown as HTMLAudioElement;

    const first = captureAudioStream(audio);
    const refreshed = captureAudioStream(audio, { forceRefresh: true });

    expect(first).toBe(firstStream);
    expect(refreshed).toBe(secondStream);
    expect(captureStream).toHaveBeenCalledTimes(2);
  });

  it("prefers the audio context capture path when requested", () => {
    const captureStream = vi.fn(() => ({
      getAudioTracks: () => [{ id: "native-track" }],
      getTracks: () => [{ id: "native-track", stop: vi.fn() }]
    }));
    const destinationStream = {
      getAudioTracks: () => [{ id: "context-track" }],
      getTracks: () => [{ id: "context-track", stop: vi.fn() }]
    } as unknown as MediaStream;
    const resume = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn();
    const createMediaElementSource = vi.fn(() => ({ connect }));
    const speakerDestination = {};
    const createMediaStreamDestination = vi.fn(() => ({
      stream: destinationStream
    }));

    const previousWindow = (globalThis as { window?: unknown }).window;
    const testWindow = {
      AudioContext: vi.fn().mockImplementation(() => ({
        state: "running",
        resume,
        close,
        createMediaElementSource,
        createMediaStreamDestination,
        destination: speakerDestination
      }))
    } as unknown as Window;
    (globalThis as { window?: unknown }).window = testWindow;

    const audio = {
      captureStream
    } as unknown as HTMLAudioElement;

    const stream = captureAudioStream(audio, { preferAudioContext: true });

    expect(stream).toBe(destinationStream);
    expect(captureStream).not.toHaveBeenCalled();
    expect(createMediaElementSource).toHaveBeenCalledWith(audio);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ stream: destinationStream }));
    expect(connect).toHaveBeenCalledWith(speakerDestination);
    expect(getCapturedAudioStreamMode(audio)).toBe("audio-context");

    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("reuses the existing audio-context capture graph when forceRefresh is requested", () => {
    const destinationStream = {
      getAudioTracks: () => [{ id: "context-track" }],
      getTracks: () => [{ id: "context-track", stop: vi.fn() }]
    } as unknown as MediaStream;
    const resume = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn();
    const createMediaElementSource = vi.fn(() => ({ connect }));
    const createMediaStreamDestination = vi.fn(() => ({
      stream: destinationStream
    }));

    const previousWindow = (globalThis as { window?: unknown }).window;
    const testWindow = {
      AudioContext: vi.fn().mockImplementation(() => ({
        state: "running",
        resume,
        close,
        createMediaElementSource,
        createMediaStreamDestination,
        destination: {}
      }))
    } as unknown as Window;
    (globalThis as { window?: unknown }).window = testWindow;

    const audio = {
      captureStream: vi.fn(() => ({
        getAudioTracks: () => [{ id: "native-track" }],
        getTracks: () => [{ id: "native-track", stop: vi.fn() }]
      }))
    } as unknown as HTMLAudioElement;

    const first = captureAudioStream(audio, { preferAudioContext: true });
    const refreshed = captureAudioStream(audio, {
      forceRefresh: true,
      preferAudioContext: true
    });

    expect(first).toBe(destinationStream);
    expect(refreshed).toBe(destinationStream);
    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    (globalThis as { window?: unknown }).window = previousWindow;
  });
});

describe("buildTrackMeta", () => {
  it("builds neutral metadata for standard uploads", async () => {
    const restoreCreateElement = mockAudioMetadataElement(12.3);
    const file = new File([new Uint8Array(300 * 1024)], "demo.mp3", { type: "audio/mpeg" });

    try {
      const meta = await buildTrackMeta(file, "blob:demo", {
        userId: "host_1",
        nickname: "Host"
      } as never);

      expect(meta.durationMs).toBe(12_300);
    } finally {
      restoreCreateElement();
    }
  });

  it("keeps lossless upload metadata free of transfer manifests", async () => {
    const restoreCreateElement = mockAudioMetadataElement(18.5);
    const file = new File([new Uint8Array(26 * 1024 * 1024)], "demo.flac", {
      type: "audio/flac"
    });

    try {
      const meta = await buildTrackMeta(file, "blob:demo-flac", {
        userId: "host_1",
        nickname: "Host"
      } as never);

      expect(meta.durationMs).toBe(18_500);
    } finally {
      restoreCreateElement();
    }
  });
});

function mockAudioMetadataElement(durationSeconds: number) {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const documentMock = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== "audio") {
        throw new Error(`Unexpected element request: ${tagName}`);
      }

      const audio = {
        preload: "metadata",
        src: "",
        duration: durationSeconds,
        currentTime: 0,
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load() {
          this.onloadedmetadata?.();
        },
        onloadedmetadata: null as null | (() => void),
        ontimeupdate: null as null | (() => void),
        onerror: null as null | (() => void)
      };

      return audio as unknown as HTMLAudioElement;
    })
  };
  (globalThis as { document?: unknown }).document = documentMock;

  return () => {
    (globalThis as { document?: unknown }).document = previousDocument;
  };
}
