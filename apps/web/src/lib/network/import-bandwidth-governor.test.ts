import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImportBandwidthGovernor,
  playbackBandwidthMonitor
} from "./import-bandwidth-governor";

describe("ImportBandwidthGovernor", () => {
  afterEach(() => {
    vi.useRealTimers();
    playbackBandwidthMonitor.clear();
  });

  it("reads a large provider response without a fixed-rate delay", async () => {
    vi.useFakeTimers();
    const governor = new ImportBandwidthGovernor({ yieldBytes: 4_096 });
    const response = new Response(new Uint8Array(1_000_000), { headers: { "content-type": "audio/mpeg" } });
    const reading = governor.readResponse(response);
    await vi.runAllTimersAsync();
    await expect(reading).resolves.toBeInstanceOf(Blob);
  });

  it("does not serialize independent imports behind a shared byte queue", async () => {
    vi.useFakeTimers();
    const governor = new ImportBandwidthGovernor({ yieldBytes: 4_096 });
    const first = governor.readResponse(new Response(new Uint8Array(64_000)));
    const second = governor.readResponse(new Response(new Uint8Array(64_000)));

    await vi.runAllTimersAsync();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("reserves measured playback capacity while pacing import bytes", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { downlink: 1 }
    });
    playbackBandwidthMonitor.update("peer-1", {
      availableOutgoingBitrateKbps: 800,
      mediaReceiveBitrateKbps: 128,
      mediaSendBitrateKbps: 128,
      hasMediaTrack: true
    });
    const governor = new ImportBandwidthGovernor();

    await governor.consume(64 * 1024);
    const next = governor.consume(64 * 1024);
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(next).resolves.toBeUndefined();
  });

  it("stops an import when aborted", async () => {
    vi.useFakeTimers();
    const governor = new ImportBandwidthGovernor({ reserveBytesPerSecond: 16_000, burstBytes: 4_096 });
    const controller = new AbortController();
    const reading = governor.readResponse(new Response(new Uint8Array(20_000)), controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  });
});
