"use client";

type PendingEncode = {
  resolve: (payload: ArrayBuffer) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type EncodeResponse =
  | { id: number; ok: true; payload: ArrayBuffer }
  | { id: number; ok: false; error: string };

export class OpusSegmentEncoder {
  private readonly worker: Worker;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, PendingEncode>();
  private sequence = 0;
  private disposed = false;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.worker = new Worker(new URL("./opus-segment-encoder.worker.ts", import.meta.url), {
      type: "module",
      name: "soqaro-opus-encoder"
    });
    this.worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(event.data.id);
      clearTimeout(pending.timeoutId);
      if (event.data.ok) {
        pending.resolve(event.data.payload);
      } else {
        pending.reject(new Error(event.data.error));
      }
    };
    this.worker.onerror = (event) => {
      this.fail(new Error(event.message || "Opus encoder worker failed."));
    };
    this.worker.onmessageerror = () => {
      this.fail(new Error("Opus encoder worker returned an unreadable response."));
    };
  }

  encode(input: {
    sampleRate: number;
    channels: Float32Array[];
    bitrateKbps: 128 | 256;
  }) {
    if (this.disposed) {
      return Promise.reject(new Error("Opus encoder has been disposed."));
    }
    const id = ++this.sequence;
    const transfer = input.channels.map((channel) => channel.buffer);
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }
        this.fail(new Error(`Opus encoding timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeoutId });
      try {
        this.worker.postMessage({ id, ...input }, { transfer });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error("Unable to start Opus encoding."));
      }
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.fail(new Error("Opus encoding was cancelled."));
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private fail(error: Error) {
    if (!this.disposed) {
      this.disposed = true;
      this.worker.terminate();
    }
    this.rejectAll(error);
  }
}
