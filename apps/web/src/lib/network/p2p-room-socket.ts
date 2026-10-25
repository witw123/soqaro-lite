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
import {
  MQTT_BROKER_URLS,
  createSignalingMqttClient,
  toRoomTopic,
  type SignalingPacket
} from "./p2p-signaling";

type EventCallback = (...args: any[]) => void;

// Active P2P socket instances by room
const activeP2PSockets = new Map<string, P2PRoomSocket>();

export function broadcastP2PEvent(roomId: string, type: string, payload: any) {
  const socket = activeP2PSockets.get(roomId);
  if (socket) {
    socket.broadcastToRoom(type, payload);
  }
}

export class P2PRoomSocket {
  public connected: boolean = false;
  public id: string = "p2p-socket-" + Math.random().toString(36).slice(2, 9);
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private subscribedRoomId: string | null = null;
  private channel: BroadcastChannel | null = null;
  private destroyed: boolean = false;
  private mqttClient: any = null;
  private isHost: boolean = false;
  private mySessionId: string = "local-user";
  private myPeerId: string | null = null;
  private roomTopicBase: string = "";
  private presenceHeartbeatTimer: any = null;

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

    if (this.presenceHeartbeatTimer) {
      clearInterval(this.presenceHeartbeatTimer);
      this.presenceHeartbeatTimer = null;
    }

    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }

    if (this.mqttClient) {
      try {
        this.mqttClient.end(true);
      } catch {}
      this.mqttClient = null;
    }

    if (this.subscribedRoomId) {
      activeP2PSockets.delete(this.subscribedRoomId);
      this.subscribedRoomId = null;
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
      this.broadcastToRoom("room.playback.readiness", payload);
    } else if (event === "room.chat") {
      const message = args[0] as RoomChatMessage;
      this.dispatch("room.chat", message);
      this.broadcastToRoom("room.chat", message);
    } else if (event === "peer.signal") {
      const payload = args[0] as PeerSignalMessage;
      this.broadcastToRoom("peer.signal", payload);
    } else if (event === "room.presence") {
      this.broadcastToRoom("room.presence", {
        memberId: this.mySessionId,
        peerId: this.myPeerId
      });
    } else if (event === "room.unsubscribe") {
      this.disconnect();
    }

    return this;
  }

  public broadcastToRoom(type: string, payload: any) {
    if (this.destroyed) return;

    // 1. Multi-tab BroadcastChannel for zero-latency local tab communication
    try {
      this.channel?.postMessage({ type, payload });
    } catch {}

    // 2. Publish to MQTT signaling broker
    if (!this.mqttClient || !this.roomTopicBase) return;

    let targetId = "all";
    if (type === "peer.signal" && payload?.toPeerId) {
      targetId = payload.toPeerId;
    } else if (!this.isHost && (type === "room.playback.patch" || type === "room.queue.patch")) {
      targetId = "all";
    }

    const packet: SignalingPacket = {
      senderId: this.myPeerId || this.mySessionId,
      targetId,
      type,
      payload,
      sentAt: new Date().toISOString()
    };

    try {
      this.mqttClient.publish(`${this.roomTopicBase}/events`, JSON.stringify(packet), { qos: 0 });
    } catch {}
  }

  private handleRoomSubscribe(
    payload: { roomId: string; peerId?: string; sessionId?: string },
    ack: Function | null
  ) {
    this.subscribedRoomId = payload.roomId;
    this.myPeerId = payload.peerId ?? null;
    activeP2PSockets.set(payload.roomId, this);

    // Multi-tab BroadcastChannel setup
    if (typeof window !== "undefined") {
      if (this.channel) {
        try {
          this.channel.close();
        } catch {}
      }
      try {
        this.channel = new BroadcastChannel(`soqaro-p2p-${payload.roomId}`);
        this.channel.onmessage = (event) => {
          const data = event.data;
          if (data?.type) {
            this.dispatch(data.type, data.payload);
          }
        };
      } catch {}
    }

    // Read local snapshot to check host identity & joinCode
    let snapshot: RoomSnapshot | null = null;
    let sessionUserId = payload.sessionId ?? "anonymous";
    let sessionNickname = "本地用户";
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${payload.roomId}`);
        if (raw) snapshot = JSON.parse(raw);
        const sessionRaw = window.localStorage.getItem("soqaro-session");
        if (sessionRaw) {
          const s = JSON.parse(sessionRaw);
          if (s?.userId) sessionUserId = s.userId;
          if (s?.nickname) sessionNickname = s.nickname;
        }
      } catch {}
    }

    this.mySessionId = sessionUserId;
    this.isHost = Boolean(snapshot?.room && snapshot.room.hostId === sessionUserId);
    const joinCode = snapshot?.room?.joinCode ?? payload.roomId.replace(/^room-/, "");
    this.roomTopicBase = toRoomTopic(joinCode);

    const now = new Date().toISOString();
    const members = (snapshot?.room.members ?? [
      {
        id: sessionUserId,
        nickname: sessionNickname,
        role: this.isHost ? ("host" as const) : ("member" as const),
        joinedAt: now,
        peerId: payload.peerId ?? null,
        presenceState: "online" as const
      }
    ]).map((m) => ({
      id: m.id,
      peerId: m.peerId ?? (m.id === sessionUserId ? payload.peerId ?? null : null),
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

    // Initialize MQTT transport in browser environments (outside test runner)
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
      void this.initMqttSignaling(payload.roomId, sessionUserId, sessionNickname);
    }
  }

  private async initMqttSignaling(
    roomId: string,
    sessionUserId: string,
    sessionNickname: string
  ) {
    try {
      const brokerUrl = MQTT_BROKER_URLS[0];
      const clientId = `sq-${this.isHost ? "h" : "m"}-${sessionUserId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`;

      const client = await createSignalingMqttClient(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2500,
        keepalive: 30
      });
      this.mqttClient = client;

      client.on("connect", () => {
        this.connected = true;
        this.dispatch("connect");

        const subTopic = `${this.roomTopicBase}/#`;
        client.subscribe(subTopic, { qos: 0 });

        // If member, send subscribe packet to inform Host
        if (!this.isHost) {
          const packet: SignalingPacket = {
            senderId: this.myPeerId || sessionUserId,
            targetId: "host",
            type: "room.subscribe",
            payload: {
              memberId: sessionUserId,
              nickname: sessionNickname,
              peerId: this.myPeerId
            },
            sentAt: new Date().toISOString()
          };
          client.publish(`${this.roomTopicBase}/events`, JSON.stringify(packet), { qos: 0 });
        }
      });

      client.on("message", (_topic: string, message: Buffer) => {
        if (this.destroyed) return;
        try {
          const packet: SignalingPacket = JSON.parse(message.toString());
          if (!packet?.type) return;

          // Ignore self-echo
          const isSelf =
            packet.senderId === this.mySessionId ||
            (this.myPeerId && packet.senderId === this.myPeerId);
          if (isSelf) return;

          // Filter messages not meant for this node
          const isForMe =
            packet.targetId === "all" ||
            packet.targetId === this.mySessionId ||
            (this.myPeerId && packet.targetId === this.myPeerId) ||
            (this.isHost && packet.targetId === "host");

          if (!isForMe) return;

          this.handleIncomingSignalingPacket(roomId, packet);
        } catch {}
      });

      client.on("error", (err: any) => {
        console.warn("[P2PRoomSocket] MQTT warning:", err?.message || err);
      });

      // Presence heartbeat interval
      if (this.presenceHeartbeatTimer) clearInterval(this.presenceHeartbeatTimer);
      this.presenceHeartbeatTimer = setInterval(() => {
        if (this.connected && !this.destroyed) {
          this.broadcastToRoom("room.presence", {
            memberId: this.mySessionId,
            peerId: this.myPeerId
          });
        }
      }, 10000);
    } catch (err) {
      console.warn("[P2PRoomSocket] Init error:", err);
    }
  }

  private handleIncomingSignalingPacket(roomId: string, packet: SignalingPacket) {
    const { type, payload } = packet;

    if (type === "room.subscribe") {
      if (this.isHost) {
        const memberId = payload?.memberId || packet.senderId;
        const nickname = payload?.nickname || "访客";
        const peerId = payload?.peerId || null;

        let currentSnapshot: RoomSnapshot | null = null;
        try {
          const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
          if (raw) currentSnapshot = JSON.parse(raw);
        } catch {}

        if (currentSnapshot) {
          const existing = currentSnapshot.room.members.find((m) => m.id === memberId);
          if (existing) {
            existing.presenceState = "online";
            if (peerId) existing.peerId = peerId;
          } else {
            currentSnapshot.room.members.push({
              id: memberId,
              nickname,
              role: "member",
              joinedAt: new Date().toISOString(),
              peerId,
              presenceState: "online"
            });
          }
          currentSnapshot.room.directoryMemberCount = currentSnapshot.room.members.length;
          currentSnapshot.room.directoryOnlineMemberCount = currentSnapshot.room.members.filter(
            (m) => m.presenceState !== "offline"
          ).length;
          currentSnapshot.room.presenceRevision = (currentSnapshot.room.presenceRevision ?? 1) + 1;

          try {
            window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(currentSnapshot));
          } catch {}

          // Reply with snapshot directly to this member
          const replyPacket: SignalingPacket = {
            senderId: this.mySessionId,
            targetId: memberId,
            type: "room.snapshot",
            payload: currentSnapshot,
            sentAt: new Date().toISOString()
          };
          this.mqttClient?.publish(
            `${this.roomTopicBase}/events`,
            JSON.stringify(replyPacket),
            { qos: 0 }
          );

          // Broadcast presence update to everyone
          const presencePatch = {
            members: currentSnapshot.room.members,
            playback: currentSnapshot.room.playback,
            presenceRevision: currentSnapshot.room.presenceRevision,
            roomRevision: currentSnapshot.room.roomRevision
          };
          this.broadcastToRoom("room.presence.patch", presencePatch);
          this.dispatch("room.presence.patch", presencePatch);
        }
      }
    } else if (type === "room.snapshot") {
      try {
        window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(payload));
      } catch {}
      this.dispatch("room.snapshot", payload);
    } else if (type === "room.playback.patch") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) {
          const snap: RoomSnapshot = JSON.parse(raw);
          snap.room.playback = payload.playback;
          if (payload.roomRevision) snap.room.roomRevision = payload.roomRevision;
          window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(snap));
        }
      } catch {}
      this.dispatch("room.playback.patch", payload);
    } else if (type === "room.queue.patch") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) {
          const snap: RoomSnapshot = JSON.parse(raw);
          if (payload.queue) snap.queue = payload.queue;
          if (payload.playback) snap.room.playback = payload.playback;
          if (payload.roomRevision) snap.room.roomRevision = payload.roomRevision;
          window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(snap));
        }
      } catch {}
      this.dispatch("room.queue.patch", payload);
    } else if (type === "room.presence.patch") {
      this.dispatch("room.presence.patch", payload);
    } else if (type === "room.presence") {
      // Presence heartbeat received from a member
      if (this.isHost && payload?.memberId) {
        let currentSnapshot: RoomSnapshot | null = null;
        try {
          const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
          if (raw) currentSnapshot = JSON.parse(raw);
        } catch {}
        if (currentSnapshot) {
          const member = currentSnapshot.room.members.find((m) => m.id === payload.memberId);
          if (member && member.presenceState !== "online") {
            member.presenceState = "online";
            if (payload.peerId) member.peerId = payload.peerId;
            currentSnapshot.room.directoryOnlineMemberCount = currentSnapshot.room.members.filter(
              (m) => m.presenceState !== "offline"
            ).length;
            currentSnapshot.room.presenceRevision = (currentSnapshot.room.presenceRevision ?? 1) + 1;
            try {
              window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(currentSnapshot));
            } catch {}
            this.broadcastToRoom("room.presence.patch", {
              members: currentSnapshot.room.members,
              playback: currentSnapshot.room.playback,
              presenceRevision: currentSnapshot.room.presenceRevision,
              roomRevision: currentSnapshot.room.roomRevision
            });
            this.dispatch("room.presence.patch", {
              members: currentSnapshot.room.members,
              playback: currentSnapshot.room.playback,
              presenceRevision: currentSnapshot.room.presenceRevision,
              roomRevision: currentSnapshot.room.roomRevision
            });
          }
        }
      }
    } else if (type === "peer.signal") {
      // Dispatched into P2PMesh for WebRTC Data & RTP Opus Media establishment
      this.dispatch("peer.signal", payload);
    } else if (type === "room.chat") {
      this.dispatch("room.chat", payload);
    } else if (type === "room.playback.readiness") {
      this.dispatch("room.playback.readiness", payload);
    } else {
      this.dispatch(type, payload);
    }
  }

  private dispatch(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of Array.from(set)) {
      try {
        callback(...args);
      } catch (err) {
        console.error(`[P2PRoomSocket] Error in listener for "${event}":`, err);
      }
    }
  }
}

export function createP2PRoomSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return new P2PRoomSocket() as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;
}
