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
import { DEFAULT_ICE_SERVERS, toHostPeerId, toMemberPeerId } from "./p2p-signaling";

type EventCallback = (...args: any[]) => void;

interface PeerDataConnection {
  peer: string;
  open: boolean;
  send: (data: any) => void;
  close: () => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
}

interface PeerInstance {
  id: string;
  destroyed: boolean;
  on: (event: string, callback: (...args: any[]) => void) => void;
  connect: (targetPeerId: string, options?: any) => PeerDataConnection;
  destroy: () => void;
}

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
  private peer: PeerInstance | null = null;
  private hostConn: PeerDataConnection | null = null;
  private activeMemberConns: Map<string, PeerDataConnection> = new Map();
  private isHost: boolean = false;

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
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }
    for (const conn of this.activeMemberConns.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.activeMemberConns.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
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
      // Periodic presence heartbeat
    } else if (event === "room.unsubscribe") {
      this.disconnect();
    }

    return this;
  }

  public broadcastToRoom(type: string, payload: any) {
    if (this.destroyed) return;

    // Send through multi-tab BroadcastChannel
    try {
      this.channel?.postMessage({ type, payload });
    } catch {}

    // Send through P2P
    if (this.isHost) {
      // Host broadcasts to all connected members
      const message = { type, payload };
      for (const conn of this.activeMemberConns.values()) {
        if (conn.open) {
          try {
            conn.send(message);
          } catch {}
        }
      }
    } else if (this.hostConn && this.hostConn.open) {
      // Member sends to Host
      try {
        this.hostConn.send({ type, payload });
      } catch {}
    }
  }

  private handleRoomSubscribe(
    payload: { roomId: string; peerId?: string; sessionId?: string },
    ack: Function | null
  ) {
    this.subscribedRoomId = payload.roomId;
    activeP2PSockets.set(payload.roomId, this);

    // Setup multi-tab BroadcastChannel
    if (typeof window !== "undefined") {
      if (this.channel) {
        this.channel.close();
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

    // Read local snapshot
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

    this.isHost = Boolean(snapshot?.room && snapshot.room.hostId === sessionUserId);
    const joinCode = snapshot?.room?.joinCode ?? payload.roomId.replace(/^room-/, "");

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

    // Initialize real PeerJS P2P transport in browser environments (outside test runner)
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
      void this.initPeerJsTransport(joinCode, sessionUserId, sessionNickname, payload.roomId);
    }
  }

  private async initPeerJsTransport(
    joinCode: string,
    sessionUserId: string,
    sessionNickname: string,
    roomId: string
  ) {
    try {
      const { Peer } = await import("peerjs");

      if (this.isHost) {
        // Host peer
        const hostPeerId = toHostPeerId(joinCode);
        const peer = new Peer(hostPeerId, {
          config: DEFAULT_ICE_SERVERS,
          debug: 0
        }) as unknown as PeerInstance;
        this.peer = peer;

        peer.on("open", () => {
          this.connected = true;
          this.dispatch("connect");
        });

        peer.on("connection", (conn: PeerDataConnection) => {
          conn.on("open", () => {
            this.activeMemberConns.set(conn.peer, conn);
          });

          conn.on("data", (data: any) => {
            if (!data?.type) return;

            if (data.type === "room.subscribe") {
              const memberId = data.payload?.memberId || conn.peer;
              const nickname = data.payload?.nickname || "访客";

              // Retrieve and update snapshot
              let currentSnapshot: RoomSnapshot | null = null;
              try {
                const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
                if (raw) currentSnapshot = JSON.parse(raw);
              } catch {}

              if (currentSnapshot) {
                const existingIdx = currentSnapshot.room.members.findIndex((m) => m.id === memberId);
                if (existingIdx >= 0) {
                  currentSnapshot.room.members[existingIdx].presenceState = "online";
                } else {
                  currentSnapshot.room.members.push({
                    id: memberId,
                    nickname,
                    role: "member",
                    joinedAt: new Date().toISOString(),
                    peerId: conn.peer,
                    presenceState: "online"
                  });
                }
                currentSnapshot.room.directoryMemberCount = currentSnapshot.room.members.length;
                currentSnapshot.room.directoryOnlineMemberCount = currentSnapshot.room.members.filter((m) => m.presenceState !== "offline").length;
                currentSnapshot.room.presenceRevision = (currentSnapshot.room.presenceRevision ?? 1) + 1;
                try {
                  window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(currentSnapshot));
                } catch {}

                // Send snapshot back to subscriber
                conn.send({
                  type: "room.snapshot",
                  payload: currentSnapshot
                });

                // Broadcast presence patch to all peers
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
            } else if (data.type === "room.chat") {
              this.dispatch("room.chat", data.payload);
              // Forward to all other members
              for (const [peerId, otherConn] of this.activeMemberConns.entries()) {
                if (peerId !== conn.peer && otherConn.open) {
                  try {
                    otherConn.send(data);
                  } catch {}
                }
              }
            } else if (data.type === "room.playback.readiness") {
              this.dispatch("room.playback.readiness", data.payload);
            } else if (data.type === "peer.signal") {
              this.dispatch("peer.signal", data.payload);
            }
          });

          conn.on("close", () => {
            this.activeMemberConns.delete(conn.peer);
            let currentSnapshot: RoomSnapshot | null = null;
            try {
              const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
              if (raw) currentSnapshot = JSON.parse(raw);
            } catch {}
            if (currentSnapshot) {
              const member = currentSnapshot.room.members.find((m) => m.peerId === conn.peer);
              if (member) {
                member.presenceState = "offline";
                currentSnapshot.room.directoryOnlineMemberCount = currentSnapshot.room.members.filter((m) => m.presenceState !== "offline").length;
                try {
                  window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(currentSnapshot));
                } catch {}
                this.broadcastToRoom("room.presence.patch", {
                  members: currentSnapshot.room.members,
                  playback: currentSnapshot.room.playback,
                  presenceRevision: (currentSnapshot.room.presenceRevision ?? 1) + 1,
                  roomRevision: currentSnapshot.room.roomRevision
                });
                this.dispatch("room.presence.patch", {
                  members: currentSnapshot.room.members,
                  playback: currentSnapshot.room.playback,
                  presenceRevision: (currentSnapshot.room.presenceRevision ?? 1) + 1,
                  roomRevision: currentSnapshot.room.roomRevision
                });
              }
            }
          });
        });

        peer.on("error", (err: any) => {
          console.warn("[P2PRoomSocket] Host peer warning:", err?.type || err?.message);
        });
      } else {
        // Member peer
        const memberPeerId = toMemberPeerId(sessionUserId);
        const hostPeerId = toHostPeerId(joinCode);
        const peer = new Peer(memberPeerId, {
          config: DEFAULT_ICE_SERVERS,
          debug: 0
        }) as unknown as PeerInstance;
        this.peer = peer;

        peer.on("open", () => {
          const conn = peer.connect(hostPeerId, { reliable: true });
          this.hostConn = conn;

          conn.on("open", () => {
            this.connected = true;
            this.dispatch("connect");
            conn.send({
              type: "room.subscribe",
              payload: {
                memberId: sessionUserId,
                nickname: sessionNickname
              }
            });
          });

          conn.on("data", (data: any) => {
            if (!data?.type) return;

            if (data.type === "room.snapshot") {
              try {
                window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(data.payload));
              } catch {}
              this.dispatch("room.snapshot", data.payload);
            } else if (data.type === "room.playback.patch") {
              this.dispatch("room.playback.patch", data.payload);
            } else if (data.type === "room.queue.patch") {
              this.dispatch("room.queue.patch", data.payload);
            } else if (data.type === "room.presence.patch") {
              this.dispatch("room.presence.patch", data.payload);
            } else if (data.type === "room.chat") {
              this.dispatch("room.chat", data.payload);
            } else if (data.type === "peer.signal") {
              this.dispatch("peer.signal", data.payload);
            } else {
              this.dispatch(data.type, data.payload);
            }
          });

          conn.on("close", () => {
            this.connected = false;
            this.dispatch("disconnect", "host connection closed");
          });

          conn.on("error", (err: any) => {
            console.warn("[P2PRoomSocket] Connection error:", err);
          });
        });

        peer.on("error", (err: any) => {
          console.warn("[P2PRoomSocket] Member peer error:", err?.type || err?.message);
        });
      }
    } catch (err) {
      console.warn("[P2PRoomSocket] Init error:", err);
    }
  }

  private dispatch(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of Array.from(set)) {
      try {
        callback(...args);
      } catch (err) {
        console.error(`[P2PRoomSocket] Handler error on "${event}":`, err);
      }
    }
  }

  public destroy() {
    this.destroyed = true;
    this.disconnect();
    this.listeners.clear();
  }
}

export function createP2PRoomSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return new P2PRoomSocket() as unknown as Socket<ServerToClientEvents, ClientToServerEvents>;
}
