export interface TrackItem {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;
  size: number;
}

export interface SyncMessage {
  type: "SYNC" | "PING" | "PONG";
  trackName?: string;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  timestamp?: number;
}

export interface PeerInfo {
  peerId: string;
  role: "host" | "listener";
}
