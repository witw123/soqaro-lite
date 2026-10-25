import type { RoomSnapshot } from "@soqaro/shared";

export const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.qq.com:3478" },
    { urls: "stun:stun.miwifi.com:3478" },
    { urls: "stun:stun.chat.bilibili.com:3478" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

export const MQTT_BROKER_URLS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt"
];

export interface SignalingPacket {
  senderId: string;
  targetId: string;
  type: string;
  payload: any;
  sentAt: string;
}

export function toRoomTopic(codeOrId: string): string {
  const clean = codeOrId.trim().toLowerCase().replace(/^room-/, "").replace(/[^a-z0-9_-]/g, "");
  return `soqaro/v1/rooms/${clean}`;
}

export async function fetchRemoteRoomSnapshotByCode(
  joinCode: string,
  session: { userId: string; nickname: string },
  timeoutMs: number = 8000
): Promise<RoomSnapshot> {
  if (typeof window === "undefined") {
    throw new Error("P2P 连接仅支持在客户端环境下运行。");
  }

  const { connect } = await import("mqtt");

  return new Promise((resolve, reject) => {
    let isDone = false;
    let timer: any = null;
    let client: any = null;

    const topicBase = toRoomTopic(joinCode);
    const subTopic = `${topicBase}/#`;
    const pubTopic = `${topicBase}/events`;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (client) {
        try {
          client.end(true);
        } catch {}
        client = null;
      }
    };

    timer = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      cleanup();
      reject(new Error("连接房主超时，请确认房间码正确且房主在线。"));
    }, timeoutMs);

    try {
      client = connect(MQTT_BROKER_URLS[0], {
        clientId: `sq-sub-${session.userId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 0
      });
    } catch {
      if (isDone) return;
      isDone = true;
      cleanup();
      reject(new Error("信令网络初始化失败，请检查网络设置。"));
      return;
    }

    client.on("connect", () => {
      if (isDone) return;
      client.subscribe(subTopic, { qos: 0 }, (err: any) => {
        if (err) {
          if (isDone) return;
          isDone = true;
          cleanup();
          reject(new Error("信令频道订阅失败。"));
          return;
        }

        const packet: SignalingPacket = {
          senderId: session.userId,
          targetId: "host",
          type: "room.subscribe",
          payload: {
            memberId: session.userId,
            nickname: session.nickname
          },
          sentAt: new Date().toISOString()
        };

        try {
          client.publish(pubTopic, JSON.stringify(packet), { qos: 0 });
        } catch {}
      });
    });

    client.on("message", (_topic: string, message: Buffer) => {
      if (isDone) return;
      try {
        const packet: SignalingPacket = JSON.parse(message.toString());
        if (
          packet &&
          packet.type === "room.snapshot" &&
          packet.payload &&
          (packet.targetId === session.userId || packet.targetId === "all")
        ) {
          isDone = true;
          cleanup();
          resolve(packet.payload as RoomSnapshot);
        }
      } catch {}
    });

    client.on("error", (err: any) => {
      if (isDone) return;
      isDone = true;
      cleanup();
      reject(new Error("信令连接异常: " + (err?.message || "网络中断")));
    });
  });
}
