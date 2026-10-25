import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpusSegmentEncoder } from "./opus-segment-encoder";

class FakeWorker {
  static latest: FakeWorker | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.latest = this;
  }
}

describe("OpusSegmentEncoder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    FakeWorker.latest = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects and terminates an encoder worker that stops responding", async () => {
    const encoder = new OpusSegmentEncoder({ timeoutMs: 25 });
    const encodePromise = encoder.encode({
      sampleRate: 48_000,
      channels: [new Float32Array(960)],
      bitrateKbps: 128
    });
    const rejection = expect(encodePromise).rejects.toThrow("timed out after 25ms");

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });

  it("rejects pending work when the worker response cannot be decoded", async () => {
    const encoder = new OpusSegmentEncoder();
    const encodePromise = encoder.encode({
      sampleRate: 48_000,
      channels: [new Float32Array(960)],
      bitrateKbps: 128
    });

    FakeWorker.latest?.onmessageerror?.({} as MessageEvent);
    await expect(encodePromise).rejects.toThrow("unreadable response");
    expect(FakeWorker.latest?.terminate).toHaveBeenCalledOnce();
  });
});
