import type {
  ClientToServerEvents,
  PeerSignalMessage,
  RoomChatMessage,
  RoomPlaybackReadinessPayload,
  RoomSnapshot,
  RoomSubscribeAckPayload,
  ServerToClientEvents
} from "@soqaro/shared";
import type { Socket } from "socket.io-client";

type EventCallback = (...args: any[]) => void;

export class LocalRoomSocket {
  public connected: boolean = false;
  public id: string = "local-socket-" + Math.random().toString(36).slice(2, 9);
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private subscribedRoomId: string | null = null;
  private channel: BroadcastChannel | null = null;
  private destroyed: boolean = false;

  constructor() {
    this.connect();
  }

  public connect(): this {
    if (this.connected || this.destroyed) return this;
    this.connected = true;
    queueMicrotask(() => {
      if (!this.destroyed && this.connected) {
        this.dispatch("connect");
      }
    });
    return this;
  }

  public disconnect(): this {
    if (!this.connected) return this;
    this.connected = false;
    this.dispatch("disconnect", "io client disconnect");
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    return this;
  }

  public on(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  public off(event: string, callback?: EventCallback): this {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback);
    }
    return this;
  }

  public removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  public emit(event: string, ...args: any[]): this {
    if (this.destroyed) return this;

    const lastArg = args[args.length - 1];
    const ack = typeof lastArg === "function" ? (lastArg as Function) : null;

    if (event === "room.subscribe") {
      const payload = args[0] as { roomId: string; peerId?: string; sessionId?: string };
      this.handleRoomSubscribe(payload, ack);
    } else if (event === "room.clock") {
      if (ack) {
        ack({ serverNow: new Date().toISOString() });
      }
    } else if (event === "room.playback.readiness") {
      const payload = args[0] as RoomPlaybackReadinessPayload;
      if (ack) {
        ack({ ...payload, updatedAt: new Date().toISOString() });
      }
      this.channel?.postMessage({ type: "room.playback.readiness", payload });
    } else if (event === "room.chat") {
      const message = args[0] as RoomChatMessage;
      this.dispatch("room.chat", message);
      this.channel?.postMessage({ type: "room.chat", payload: message });
    } else if (event === "peer.signal") {
      const payload = args[0] as PeerSignalMessage;
      this.channel?.postMessage({ type: "peer.signal", payload });
    } else if (event === "room.presence") {
      // Local presence ping
    } else if (event === "room.unsubscribe") {
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }
      this.subscribedRoomId = null;
    }

    return this;
  }

  private handleRoomSubscribe(
    payload: { roomId: string; peerId?: string },
    ack: Function | null
  ) {
    this.subscribedRoomId = payload.roomId;

    if (typeof window !== "undefined") {
      if (this.channel) {
        this.channel.close();
      }
      try {
        this.channel = new BroadcastChannel(`soqaro-channel-${payload.roomId}`);
        this.channel.onmessage = (event) => {
          const data = event.data;
          if (data?.type) {
            this.dispatch(data.type, data.payload);
          }
        };
      } catch {}
    }

    let snapshot: RoomSnapshot | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${payload.roomId}`);
        if (raw) {
          snapshot = JSON.parse(raw);
        }
      } catch {}
    }

    const now = new Date().toISOString();
    const members = (snapshot?.room.members ?? [
      {
        id: "local-user",
        nickname: "房主",
        role: "host" as const,
        joinedAt: now,
        peerId: payload.peerId ?? null,
        presenceState: "online" as const
      }
    ]).map((m) => ({
      id: m.id,
      peerId: m.peerId ?? (m.id === "local-user" ? payload.peerId ?? null : null),
      presenceState: m.presenceState ?? "online",
      role: m.role
    }));

    const defaultPlayback = {
      status: "paused" as const,
      currentTrackId: null,
      currentQueueItemId: null,
      sourceSessionId: null,
      sourcePeerId: null,
      sourceTrackId: null,
      positionMs: 0,
      startedAt: null,
      queueVersion: 1,
      playbackRevision: 1,
      mediaEpoch: 1
    };

    if (ack) {
      const ackPayload: RoomSubscribeAckPayload = {
        ok: true,
        serverNow: now,
        recoveryGeneration: 1,
        bootstrap: {
          roomId: payload.roomId,
          roomRevision: snapshot?.room.roomRevision ?? 1,
          playback: snapshot?.room.playback ?? defaultPlayback,
          presenceRevision: snapshot?.room.presenceRevision ?? 1,
          members
        }
      };
      ack(ackPayload);
    }

    if (snapshot) {
      const loaded = snapshot;
      setTimeout(() => {
        if (!this.destroyed && this.subscribedRoomId === payload.roomId) {
          this.dispatch("room.snapshot", loaded);
        }
      }, 0);
    }
  }

  private dispatch(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of Array.from(set)) {
      try {
        callback(...args);
      } catch (err) {
        console.error(`[LocalRoomSocket] Handler error on "${event}":`, err);
      }
    }
  }

  public destroy() {
    this.destroyed = true;
    this.disconnect();
    this.listeners.clear();
  }
}

export function createLocalRoomSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return new LocalRoomSocket() as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;
}
