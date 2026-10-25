import type { RoomSnapshot } from "@soqaro/shared";

export const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export function toHostPeerId(joinCode: string): string {
  const clean = joinCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `soqaro-room-${clean}`;
}

export function toMemberPeerId(userId: string): string {
  const clean = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 7);
  return `soqaro-u-${clean}-${rand}`;
}

export async function fetchRemoteRoomSnapshotByCode(
  joinCode: string,
  session: { userId: string; nickname: string },
  timeoutMs: number = 8000
): Promise<RoomSnapshot> {
  if (typeof window === "undefined") {
    throw new Error("P2P 连接仅支持在客户端环境下运行。");
  }

  const { Peer } = await import("peerjs");

  return new Promise((resolve, reject) => {
    const hostPeerId = toHostPeerId(joinCode);
    const myPeerId = toMemberPeerId(session.userId);

    let isDone = false;
    let peer: any = null;
    let timer: any = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (peer) {
        try {
          peer.destroy();
        } catch {}
      }
    };

    timer = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      cleanup();
      reject(new Error("连接房主超时，请确认房间码正确且房主在线。"));
    }, timeoutMs);

    try {
      peer = new Peer(myPeerId, {
        config: DEFAULT_ICE_SERVERS,
        debug: 0
      });
    } catch {
      if (isDone) return;
      isDone = true;
      cleanup();
      reject(new Error("P2P 引擎初始化失败，请检查网络设置。"));
      return;
    }

    peer.on("open", () => {
      if (isDone) return;
      try {
        const conn = peer.connect(hostPeerId, { reliable: true });

        conn.on("open", () => {
          if (isDone) return;
          conn.send({
            type: "room.subscribe",
            payload: {
              memberId: session.userId,
              nickname: session.nickname
            }
          });
        });

        conn.on("data", (data: any) => {
          if (isDone) return;
          if (data && data.type === "room.snapshot" && data.payload) {
            isDone = true;
            cleanup();
            resolve(data.payload as RoomSnapshot);
          }
        });

        conn.on("error", (err: any) => {
          if (isDone) return;
          isDone = true;
          cleanup();
          reject(new Error("连接房主失败: " + (err?.message || "网络中断")));
        });
      } catch {
        if (isDone) return;
        isDone = true;
        cleanup();
        reject(new Error("发起 P2P 连接失败。"));
      }
    });

    peer.on("error", (err: any) => {
      if (isDone) return;
      isDone = true;
      cleanup();
      if (err?.type === "peer-unavailable") {
        reject(new Error("未找到该房间，请确认房间码正确且房主在线。"));
      } else {
        reject(new Error("P2P 连接异常: " + (err?.message || err?.type || "请稍后重试")));
      }
    });
  });
}
