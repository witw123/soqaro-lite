import { useState, useRef, useEffect, useCallback } from "react";
import { Peer, type DataConnection, type MediaConnection } from "peerjs";
import type { SyncMessage } from "../types";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface UseWebRtcSyncOptions {
  roomId: string;
  role: "host" | "listener";
  mediaStream: MediaStream | null;
  onSyncReceived?: (sync: SyncMessage) => void;
}

export function useWebRtcSync({
  roomId,
  role,
  mediaStream,
  onSyncReceived,
}: UseWebRtcSyncOptions) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [peerId, setPeerId] = useState<string>("");
  const [peerCount, setPeerCount] = useState<number>(1);
  const [needsUserGesture, setNeedsUserGesture] = useState<boolean>(false);
  const [remoteAudioAttached, setRemoteAudioAttached] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const activeConnsRef = useRef<Map<string, DataConnection>>(new Map());
  const activeCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize listener's audio element
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
    }
  }, []);

  // Send DataChannel message to all connected peers
  const broadcastSync = useCallback((sync: SyncMessage) => {
    activeConnsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(sync);
        } catch (e) {
          console.warn("Failed to send sync message:", e);
        }
      }
    });
  }, []);

  // Update track on active calls when Host's mediaStream changes
  useEffect(() => {
    if (role !== "host" || !mediaStream) return;
    const track = mediaStream.getAudioTracks()[0];
    if (!track) return;

    activeCallsRef.current.forEach((call) => {
      const sender = call.peerConnection?.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        void sender.replaceTrack(track);
      }
    });
  }, [mediaStream, role]);

  // If Host now has mediaStream, call any listeners that were waiting for stream
  useEffect(() => {
    if (role !== "host" || !mediaStream || !peerRef.current) return;

    activeConnsRef.current.forEach((_conn, targetPeerId) => {
      if (!activeCallsRef.current.has(targetPeerId)) {
        try {
          const call = peerRef.current!.call(targetPeerId, mediaStream);
          activeCallsRef.current.set(targetPeerId, call);
          call.on("close", () => {
            activeCallsRef.current.delete(targetPeerId);
          });
        } catch (e) {
          console.warn(`Failed to call listener ${targetPeerId}:`, e);
        }
      }
    });
  }, [mediaStream, role]);

  // Main Peer initialization
  useEffect(() => {
    if (!roomId) return;
    setConnectionError(null);

    const cleanRoomId = roomId.trim().toLowerCase();
    const isHost = role === "host";
    const hostTargetId = `soqaro-${cleanRoomId}-host`;
    const myId = isHost ? hostTargetId : undefined;

    const peer = new Peer(myId as string, {
      debug: 1,
      config: ICE_SERVERS,
    });
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      setIsConnected(true);
      console.log(`[p2p] peer open id=${id} role=${role}`);

      // If Listener, connect to Host's peer ID
      if (!isHost) {
        const conn = peer.connect(hostTargetId, { reliable: true });
        conn.on("open", () => {
          activeConnsRef.current.set(hostTargetId, conn);
          setPeerCount(2);
          console.log("[p2p] connected to host");
        });

        conn.on("data", (data) => {
          if (onSyncReceived) {
            onSyncReceived(data as SyncMessage);
          }
        });

        conn.on("close", () => {
          activeConnsRef.current.delete(hostTargetId);
          setPeerCount(1);
          setConnectionError("房主已断开连接");
        });
      }
    });

    // Handle incoming Data Connection
    peer.on("connection", (conn) => {
      console.log("[p2p] incoming connection from", conn.peer);
      conn.on("open", () => {
        activeConnsRef.current.set(conn.peer, conn);
        setPeerCount(activeConnsRef.current.size + 1);

        // If Host already has audio stream, call this listener immediately
        if (isHost && mediaStream) {
          const call = peer.call(conn.peer, mediaStream);
          activeCallsRef.current.set(conn.peer, call);

          call.on("close", () => {
            activeCallsRef.current.delete(conn.peer);
          });

          // Optimize Opus sender bitrate (256kbps)
          if (call.peerConnection) {
            const sender = call.peerConnection.getSenders().find((s) => s.track?.kind === "audio");
            if (sender && typeof sender.getParameters === "function") {
              try {
                const params = sender.getParameters();
                if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
                params.encodings[0].maxBitrate = 256000;
                void sender.setParameters(params);
              } catch {
                // Ignore
              }
            }
          }
        }
      });

      conn.on("data", (data) => {
        if (onSyncReceived) {
          onSyncReceived(data as SyncMessage);
        }
      });

      conn.on("close", () => {
        activeConnsRef.current.delete(conn.peer);
        setPeerCount(activeConnsRef.current.size + 1);
      });
    });

    // Handle incoming Media Call (Listener receives audio stream from Host)
    peer.on("call", (call) => {
      console.log("[p2p] incoming media call from", call.peer);
      call.answer(); // Listener answers without sending any stream

      call.on("stream", (remoteStream) => {
        console.log("[p2p] received remote stream");
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          setRemoteAudioAttached(true);
          remoteAudioRef.current
            .play()
            .then(() => {
              setNeedsUserGesture(false);
            })
            .catch((err) => {
              console.warn("Autoplay blocked, needs click:", err);
              setNeedsUserGesture(true);
            });
        }
      });

      call.on("close", () => {
        setRemoteAudioAttached(false);
      });
    });

    peer.on("error", (err) => {
      console.error("[p2p] error:", err);
      if (err.type === "unavailable-id") {
        setConnectionError("该房间号已被占用或房主仍在连接中，请更换房间号");
      } else if (err.type === "peer-unavailable") {
        setConnectionError("找不到该房间，请确认房主已创建并在线");
      } else {
        setConnectionError(`连接异常: ${err.message || err.type}`);
      }
    });

    return () => {
      activeConnsRef.current.forEach((conn) => conn.close());
      activeConnsRef.current.clear();
      activeCallsRef.current.forEach((call) => call.close());
      activeCallsRef.current.clear();
      peer.destroy();
      setIsConnected(false);
    };
  }, [roomId, role, mediaStream, onSyncReceived]);

  // Listener unlock audio button click
  const unlockAudio = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => setNeedsUserGesture(false))
        .catch((e) => console.error("Still blocked:", e));
    }
  }, []);

  // Listener local volume slider
  const setRemoteVolume = useCallback((vol: number) => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = Math.max(0, Math.min(1, vol));
    }
  }, []);

  return {
    isConnected,
    peerId,
    peerCount,
    needsUserGesture,
    remoteAudioAttached,
    connectionError,
    broadcastSync,
    unlockAudio,
    setRemoteVolume,
  };
}
