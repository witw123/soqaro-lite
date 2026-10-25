const defaultYieldBytes = 256 * 1024;
const pacingQuantumBytes = 64 * 1024;
const stalePlaybackSampleMs = 4_000;
const minimumPlaybackReserveBytesPerSecond = 96_000;
const minimumImportRateBytesPerSecond = 32_000;
const maximumImportRateBytesPerSecond = 4 * 1024 * 1024;

type ImportBandwidthGovernorOptions = {
  /**
   * Kept for backwards-compatible construction by callers that used the
   * previous governor. These legacy fixed-rate values no longer determine the
   * budget; delaying a response body based on a stale fixed rate can make the
   * provider close the stream before a song has been imported.
   */
  reserveBytesPerSecond?: number;
  burstBytes?: number;
  yieldBytes?: number;
};

/**
 * Collects provider responses with an adaptive, playback-aware bandwidth cap.
 *
 * Provider imports are requested with fetch priority "low". The browser can
 * then schedule that request behind realtime playback traffic while this
 * reader keeps consuming the response often enough to preserve the upstream
 * connection. The cap is recalculated from current WebRTC/network samples for
 * every pacing quantum.
 */
export class ImportBandwidthGovernor {
  private readonly yieldBytes: number;
  private nextImportAtMs = 0;

  constructor(options: ImportBandwidthGovernorOptions = {}) {
    this.yieldBytes = Math.max(32 * 1024, Math.floor(options.yieldBytes ?? defaultYieldBytes));
  }

  async consume(bytes: number, signal?: AbortSignal) {
    throwIfAborted(signal);
    let remaining = Math.max(0, bytes);
    while (remaining > 0) {
      const quantum = Math.min(remaining, pacingQuantumBytes);
      const rate = resolveDynamicImportRate();
      if (rate !== null) {
        const now = performance.now();
        const startAt = Math.max(now, this.nextImportAtMs);
        this.nextImportAtMs = startAt + (quantum / rate) * 1_000;
        await abortableDelay(startAt - now, signal);
      }
      remaining -= quantum;
    }
  }

  async readResponse(response: Response, signal?: AbortSignal) {
    throwIfAborted(signal);
    if (!response.body || typeof response.body.getReader !== "function") {
      const blob = await response.blob();
      throwIfAborted(signal);
      return blob;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesSinceYield = 0;
    let totalBytes = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        const next = await readWithAbort(reader, signal);
        if (next.done) break;
        if (!next.value) continue;

        chunks.push(next.value);
        totalBytes += next.value.byteLength;
        await this.consume(next.value.byteLength, signal);
        bytesSinceYield += next.value.byteLength;
        if (bytesSinceYield >= this.yieldBytes) {
          bytesSinceYield = 0;
          await yieldToScheduler(signal);
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }

    throwIfAborted(signal);
    const output = new ArrayBuffer(totalBytes);
    const outputView = new Uint8Array(output);
    let offset = 0;
    for (const chunk of chunks) {
      outputView.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Blob([output], {
      type: response.headers.get("content-type") ?? "application/octet-stream"
    });
  }
}

export const importBandwidthGovernor = new ImportBandwidthGovernor();

type PlaybackBandwidthSample = {
  availableOutgoingBitrateKbps?: number | null;
  mediaReceiveBitrateKbps?: number | null;
  mediaSendBitrateKbps?: number | null;
  packetLossRate?: number | null;
  jitterMs?: number | null;
  hasMediaTrack?: boolean;
};

type PlaybackBandwidthSnapshot = {
  active: boolean;
  availableOutgoingBitrateKbps: number | null;
  mediaDemandKbps: number;
  congested: boolean;
};

/**
 * Aggregates the local WebRTC media samples used by the adaptive import
 * scheduler. Samples expire quickly so a departed peer cannot reserve
 * bandwidth forever.
 */
class PlaybackBandwidthMonitor {
  private readonly samples = new Map<string, { sample: PlaybackBandwidthSample; updatedAtMs: number }>();

  update(peerId: string, sample: PlaybackBandwidthSample) {
    this.samples.set(peerId, { sample, updatedAtMs: Date.now() });
  }

  remove(peerId: string) {
    this.samples.delete(peerId);
  }

  clear() {
    this.samples.clear();
  }

  snapshot(now = Date.now()): PlaybackBandwidthSnapshot {
    for (const [peerId, value] of this.samples) {
      if (now - value.updatedAtMs > stalePlaybackSampleMs) {
        this.samples.delete(peerId);
      }
    }

    const samples = [...this.samples.values()].map(({ sample }) => sample);
    const availableValues = samples
      .map((sample) => sample.availableOutgoingBitrateKbps)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const mediaDemandKbps = samples.reduce((total, sample) => {
      const receive = finiteNonNegative(sample.mediaReceiveBitrateKbps);
      const send = finiteNonNegative(sample.mediaSendBitrateKbps);
      return total + (receive ?? 0) + (send ?? 0);
    }, 0);
    return {
      active: samples.some((sample) =>
        sample.hasMediaTrack === true ||
        (finiteNonNegative(sample.mediaReceiveBitrateKbps) ?? 0) > 0 ||
        (finiteNonNegative(sample.mediaSendBitrateKbps) ?? 0) > 0
      ),
      availableOutgoingBitrateKbps: availableValues.length > 0 ? Math.min(...availableValues) : null,
      mediaDemandKbps,
      congested: samples.some((sample) =>
        (sample.packetLossRate ?? 0) >= 3 || (sample.jitterMs ?? 0) >= 30
      )
    };
  }
}

export const playbackBandwidthMonitor = new PlaybackBandwidthMonitor();

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw toAbortError(signal);
  }
}

function toAbortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function resolveDynamicImportRate() {
  const playback = playbackBandwidthMonitor.snapshot();
  const connection = typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: { downlink?: number } }).connection
    : undefined;
  const downlinkMbps = connection?.downlink;
  const browserCapacity = Number.isFinite(downlinkMbps) && downlinkMbps && downlinkMbps > 0
    ? downlinkMbps * 125_000
    : null;
  const rtcCapacity = playback.availableOutgoingBitrateKbps !== null
    ? playback.availableOutgoingBitrateKbps * 125
    : null;
  const linkCapacity = browserCapacity !== null && rtcCapacity !== null
    ? Math.min(browserCapacity, rtcCapacity)
    : browserCapacity ?? rtcCapacity;
  if (linkCapacity === null || linkCapacity <= 0) {
    return null;
  }

  const playbackDemand = playback.mediaDemandKbps * 125;
  const reserve = playback.active
    ? Math.max(
        minimumPlaybackReserveBytesPerSecond,
        playbackDemand * 1.5,
        linkCapacity * 0.3
      )
    : Math.max(32_000, linkCapacity * 0.1);
  const available = Math.max(0, linkCapacity - reserve);
  const share = playback.congested ? 0.2 : playback.active ? 0.65 : 0.85;
  return Math.min(
    maximumImportRateBytesPerSecond,
    Math.max(minimumImportRateBytesPerSecond, available * share)
  );
}

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readWithAbort<T>(reader: ReadableStreamDefaultReader<T>, signal?: AbortSignal) {
  if (!signal) {
    return reader.read();
  }

  return new Promise<ReadableStreamReadResult<T>>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", abort);
    const resolveOnce = (result: ReadableStreamReadResult<T>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => {
      void reader.cancel().catch(() => undefined);
      rejectOnce(toAbortError(signal));
    };

    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    reader.read().then(resolveOnce, rejectOnce);
  });
}

function yieldToScheduler(signal?: AbortSignal) {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(toAbortError(signal!));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 0);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  if (ms <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(toAbortError(signal!));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
