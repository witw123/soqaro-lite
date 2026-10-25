import { describe, expect, it, vi } from "vitest";
import {
  DataChannelManager,
  resolveDataChannelClosedAction
} from "./data-channel-manager";

class FakeDataChannel {
  label = "soqaro-control";
  binaryType: BinaryType = "blob";
  readyState: RTCDataChannelState = "connecting";
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  bufferedAmount = 0;
  close = vi.fn();
}

function buildEntry() {
  return {
    channel: null as RTCDataChannel | null,
    dataChannelState: null as RTCDataChannelState | null,
    lastSignalProgressAtMs: 0,
    reconnectAttempts: 0,
    releasing: false
  };
}

describe("control data channel manager", () => {
  it("binds only the single ordered control channel", () => {
    const manager = new DataChannelManager({ autoReconnect: true });
    const entry = buildEntry();
    const channel = new FakeDataChannel();

    manager.bind({
      peerId: "peer_b",
      entry,
      channel: channel as unknown as RTCDataChannel,
      schedulePeerWatchdog: vi.fn(),
      clearPendingRequestsForPeer: vi.fn(),
      schedulePeerReconnect: vi.fn(),
      onMessage: vi.fn()
    });

    expect(entry.channel).toBe(channel);
    expect(channel.binaryType).toBe("arraybuffer");
    expect(entry.dataChannelState).toBe("connecting");
  });

  it("rejects legacy transfer channels without binding them", () => {
    const manager = new DataChannelManager({ autoReconnect: true });
    const entry = buildEntry();
    const channel = new FakeDataChannel();
    channel.label = "legacy-transfer-channel";

    manager.bind({
      peerId: "peer_b",
      entry,
      channel: channel as unknown as RTCDataChannel,
      schedulePeerWatchdog: vi.fn(),
      clearPendingRequestsForPeer: vi.fn(),
      schedulePeerReconnect: vi.fn(),
      onMessage: vi.fn()
    });

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(entry.channel).toBeNull();
  });

  it("reports unexpected close but stays quiet while releasing", () => {
    expect(resolveDataChannelClosedAction({ releasing: false, autoReconnect: true })).toEqual({
      shouldReportStalled: true,
      shouldScheduleReconnect: true
    });
    expect(resolveDataChannelClosedAction({ releasing: true, autoReconnect: true })).toEqual({
      shouldReportStalled: false,
      shouldScheduleReconnect: false
    });
  });
});
