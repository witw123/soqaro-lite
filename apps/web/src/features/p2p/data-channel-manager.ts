type DataChannelLifecycleEntry = {
  channel?: RTCDataChannel | null;
  dataChannelState: RTCDataChannelState | null;
  lastSignalProgressAtMs: number;
  reconnectAttempts: number;
  releasing: boolean;
};

type DataChannelManagerCallbacks = {
  onDataChannelStateChange?: (payload: {
    peerId: string;
    state: RTCDataChannelState;
  }) => void;
  onDataBufferedAmountChange?: (payload: {
    peerId: string;
    bufferedAmountBytes: number;
  }) => void;
  onPeerConnectionChange?: (payload: {
    peerId: string;
    state: RTCPeerConnectionState;
  }) => void;
  onPeerStalled?: (payload: {
    peerId: string;
    reason: "watchdog-timeout" | "connection-failed" | "data-channel-closed";
  }) => void;
};

export class DataChannelManager {
  private readonly autoReconnect: boolean;
  private readonly callbacks: DataChannelManagerCallbacks;

  constructor(input: {
    autoReconnect: boolean;
  } & DataChannelManagerCallbacks) {
    this.autoReconnect = input.autoReconnect;
    this.callbacks = input;
  }

  bind(input: {
    peerId: string;
    entry: DataChannelLifecycleEntry;
    channel: RTCDataChannel;
    schedulePeerWatchdog: () => void;
    clearPendingRequestsForPeer: (peerId: string) => void;
    schedulePeerReconnect: () => void;
    onMessage: (event: MessageEvent) => void | Promise<void>;
  }) {
    const { channel, entry, peerId } = input;
    if (channel.label !== "soqaro-control") {
      channel.close();
      return;
    }

    entry.channel = channel;
    channel.binaryType = "arraybuffer";
    entry.dataChannelState = channel.readyState;
    entry.lastSignalProgressAtMs = Date.now();
    this.callbacks.onDataChannelStateChange?.({
      peerId,
      state: channel.readyState
    });
    this.callbacks.onDataBufferedAmountChange?.({
      peerId,
      bufferedAmountBytes: channel.bufferedAmount
    });
    input.schedulePeerWatchdog();

    channel.onopen = () => {
      entry.dataChannelState = channel.readyState;
      entry.lastSignalProgressAtMs = Date.now();
      entry.reconnectAttempts = 0;
      this.callbacks.onDataChannelStateChange?.({
        peerId,
        state: channel.readyState
      });
      this.callbacks.onDataBufferedAmountChange?.({
        peerId,
        bufferedAmountBytes: channel.bufferedAmount
      });
      input.schedulePeerWatchdog();
    };

    channel.onbufferedamountlow = () => {
      this.callbacks.onDataBufferedAmountChange?.({
        peerId,
        bufferedAmountBytes: channel.bufferedAmount
      });
    };

    channel.onmessage = async (event) => {
      entry.lastSignalProgressAtMs = Date.now();
      await input.onMessage(event);
    };

    channel.onclose = () => {
      if (entry.channel === channel) {
        entry.channel = null;
      }
      entry.dataChannelState = "closed";
      this.callbacks.onDataChannelStateChange?.({
        peerId,
        state: "closed"
      });
      this.callbacks.onDataBufferedAmountChange?.({
        peerId,
        bufferedAmountBytes: 0
      });
      input.clearPendingRequestsForPeer(peerId);
      this.callbacks.onPeerConnectionChange?.({
        peerId,
        state: "closed"
      });
      const closedAction = resolveDataChannelClosedAction({
        releasing: entry.releasing,
        autoReconnect: this.autoReconnect
      });
      if (closedAction.shouldReportStalled) {
        this.callbacks.onPeerStalled?.({
          peerId,
          reason: "data-channel-closed"
        });
      }
      if (closedAction.shouldScheduleReconnect) {
        input.schedulePeerReconnect();
      }
    };
  }
}

export function resolveDataChannelClosedAction(input: {
  releasing: boolean;
  autoReconnect: boolean;
}) {
  if (input.releasing) {
    return {
      shouldReportStalled: false,
      shouldScheduleReconnect: false
    };
  }

  return {
    shouldReportStalled: true,
    shouldScheduleReconnect: input.autoReconnect
  };
}
