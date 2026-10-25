import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Share2,
  LogOut,
  Upload,
  Radio,
  Headphones,
  Check,
  Trash2,
} from "lucide-react";
import { useAudioHostEngine } from "./hooks/useAudioHostEngine";
import { useWebRtcSync } from "./hooks/useWebRtcSync";
import type { SyncMessage } from "./types";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function App() {
  const [roomId, setRoomId] = useState<string>("");
  const [role, setRole] = useState<"host" | "listener" | null>(null);
  const [inputRoomId, setInputRoomId] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  // Listener sync state
  const [listenerState, setListenerState] = useState<{
    trackName: string;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }>({
    trackName: "等待房主选曲",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  const [listenerVolume, setListenerVolume] = useState<number>(0.8);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Host Audio Engine
  const hostEngine = useAudioHostEngine();

  // Handle incoming sync state on listener
  const handleSyncReceived = useCallback((sync: SyncMessage) => {
    if (sync.type === "SYNC") {
      setListenerState((prev) => ({
        trackName: sync.trackName || prev.trackName,
        isPlaying: sync.isPlaying ?? prev.isPlaying,
        currentTime: sync.currentTime ?? prev.currentTime,
        duration: sync.duration ?? prev.duration,
      }));
    }
  }, []);

  // WebRTC P2P Sync (Zero backend)
  const sync = useWebRtcSync({
    roomId,
    role: role || "listener",
    mediaStream: role === "host" ? hostEngine.mediaStream : null,
    onSyncReceived: handleSyncReceived,
  });

  // Host broadcasts state whenever track/playback/time changes
  useEffect(() => {
    if (role === "host" && sync.isConnected) {
      sync.broadcastSync({
        type: "SYNC",
        trackName: hostEngine.currentTrack?.name || "未播放",
        isPlaying: hostEngine.isPlaying,
        currentTime: hostEngine.currentTime,
        duration: hostEngine.duration,
        timestamp: Date.now(),
      });
    }
  }, [
    role,
    sync.isConnected,
    hostEngine.currentTrack?.name,
    hostEngine.isPlaying,
    hostEngine.currentTime,
    hostEngine.duration,
    sync.broadcastSync,
  ]);

  // Read URL query on mount (?room=xyz)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room") || window.location.hash.replace("#", "");
    if (roomParam) {
      const clean = roomParam.trim().toLowerCase();
      setRoomId(clean);
      setRole("listener");
    }
  }, []);

  const handleCreateRoom = () => {
    const randomCode = Math.random().toString(36).substring(2, 8);
    setRoomId(randomCode);
    setRole("host");
    window.history.replaceState(null, "", `?room=${randomCode}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRoomId.trim()) return;
    const clean = inputRoomId.trim().toLowerCase();
    setRoomId(clean);
    setRole("listener");
    window.history.replaceState(null, "", `?room=${clean}`);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExit = () => {
    setRole(null);
    setRoomId("");
    window.history.replaceState(null, "", window.location.pathname);
  };

  // Drag & drop handlers for Host
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      hostEngine.loadFiles(e.dataTransfer.files);
    }
  };

  // Render Lobby (Welcome Screen)
  if (!role || !roomId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--slate-1)] text-[var(--slate-12)]">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--slate-12)]">Soqaro Lite</h1>
            <p className="mt-1 text-xs text-[var(--slate-11)]">点对点高保真多人同步听歌</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleCreateRoom}
              className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[var(--blue-9)] text-xs font-medium text-white hover:bg-[var(--blue-10)] transition-colors duration-200"
            >
              <Radio className="h-4 w-4" />
              创建同听房间
            </button>

            <div className="flex items-center gap-2 my-1">
              <div className="h-[0.5px] flex-1 bg-[var(--slate-6)]" />
              <span className="text-xs text-[var(--slate-9)]">或</span>
              <div className="h-[0.5px] flex-1 bg-[var(--slate-6)]" />
            </div>

            <form onSubmit={handleJoinRoom} className="flex gap-2">
              <input
                type="text"
                placeholder="输入房间号"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                className="h-10 flex-1 rounded bg-[var(--slate-3)] px-3 text-xs text-[var(--slate-12)] border-[0.5px] border-[var(--slate-6)] focus:border-[var(--blue-9)] focus:outline-none transition-colors duration-200"
              />
              <button
                type="submit"
                disabled={!inputRoomId.trim()}
                className="flex h-10 items-center justify-center gap-1.5 rounded bg-[var(--slate-4)] px-4 text-xs font-medium text-[var(--slate-12)] hover:bg-[var(--slate-5)] border-[0.5px] border-[var(--slate-6)] disabled:opacity-40 transition-colors duration-200"
              >
                <Headphones className="h-4 w-4" />
                加入
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // Active Room Screen
  const currentTrackName =
    role === "host" ? hostEngine.currentTrack?.name || "未选择歌曲" : listenerState.trackName;
  const currentPos = role === "host" ? hostEngine.currentTime : listenerState.currentTime;
  const totalDuration = role === "host" ? hostEngine.duration : listenerState.duration;
  const playing = role === "host" ? hostEngine.isPlaying : listenerState.isPlaying;

  return (
    <div
      onDragOver={role === "host" ? handleDragOver : undefined}
      onDrop={role === "host" ? handleDrop : undefined}
      className="flex min-h-screen flex-col bg-[var(--slate-1)] text-[var(--slate-12)]"
    >
      {/* Top Bar */}
      <header className="flex h-12 w-full items-center justify-between px-4 sm:px-8 border-b-[0.5px] border-[var(--slate-6)] bg-[var(--slate-2)]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">Soqaro Lite</span>
          <div className="flex items-center gap-1.5 rounded bg-[var(--slate-3)] px-2 py-0.5 border-[0.5px] border-[var(--slate-6)]">
            <span
              className={`h-2 w-2 rounded-full ${sync.isConnected ? "bg-[var(--green-9)]" : "bg-[var(--ruby-9)]"}`}
            />
            <span className="text-xs text-[var(--slate-11)]">
              {role === "host" ? "房主广播" : "收听中"}
            </span>
          </div>
          <span className="text-xs text-[var(--slate-11)] hidden sm:inline">
            在线 {sync.peerCount} 人
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex h-8 items-center gap-1.5 rounded bg-[var(--slate-3)] px-2.5 text-xs text-[var(--slate-12)] border-[0.5px] border-[var(--slate-6)] hover:bg-[var(--slate-4)] transition-colors duration-200"
            title="复制房间链接"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--green-9)]" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copied ? "已复制" : `房间: ${roomId}`}</span>
          </button>
          <button
            onClick={handleExit}
            className="flex h-8 w-8 items-center justify-center rounded bg-[var(--slate-3)] text-[var(--slate-11)] border-[0.5px] border-[var(--slate-6)] hover:text-[var(--slate-12)] hover:bg-[var(--slate-4)] transition-colors duration-200"
            title="退出房间"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md flex flex-col gap-6">
          {/* Connection Error Banner */}
          {sync.connectionError && (
            <div className="rounded bg-[var(--ruby-3)] p-3 border-[0.5px] border-[var(--ruby-9)] text-xs text-[var(--ruby-11)] text-center">
              {sync.connectionError}
            </div>
          )}

          {/* Autoplay Unlock Notice (Listener) */}
          {role === "listener" && sync.needsUserGesture && (
            <div className="flex flex-col items-center gap-2 rounded bg-[var(--blue-3)] p-4 border-[0.5px] border-[var(--blue-9)] text-center">
              <span className="text-xs text-[var(--blue-11)]">浏览器限制自动播放，请点击开启收听</span>
              <button
                onClick={sync.unlockAudio}
                className="h-8 rounded bg-[var(--blue-9)] px-4 text-xs font-medium text-white hover:bg-[var(--blue-10)] transition-colors duration-200"
              >
                开启同步收听
              </button>
            </div>
          )}

          {/* Player Box */}
          <section className="flex flex-col gap-5 rounded bg-[var(--slate-2)] p-6 border-[0.5px] border-[var(--slate-6)]">
            {/* Track Info */}
            <div className="flex flex-col items-center text-center gap-1">
              <h2 className="text-sm font-medium text-[var(--slate-12)] truncate max-w-full">
                {currentTrackName}
              </h2>
              <span className="text-xs text-[var(--slate-11)]">
                {role === "host" ? (hostEngine.playlist.length > 0 ? `队列共 ${hostEngine.playlist.length} 首` : "拖入音频开始播放") : (playing ? "实时同步传输中" : "已就绪")}
              </span>
            </div>

            {/* Geometric Audio Spectrum */}
            <div className="flex h-10 items-end justify-center gap-1.5 py-1">
              {hostEngine.frequencyData.map((val, idx) => (
                <div
                  key={idx}
                  style={{ height: `${Math.max(3, val * 36)}px` }}
                  className={`w-1 rounded-sm transition-all duration-75 ${
                    playing ? "bg-[var(--blue-9)]" : "bg-[var(--slate-5)]"
                  }`}
                />
              ))}
            </div>

            {/* Progress Bar & Time */}
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min={0}
                max={totalDuration || 100}
                step={0.1}
                value={currentPos}
                disabled={role !== "host"}
                onChange={(e) => {
                  if (role === "host") {
                    hostEngine.seek(parseFloat(e.target.value));
                  }
                }}
                className={`h-1 w-full rounded bg-[var(--slate-5)] cursor-pointer ${
                  role !== "host" ? "cursor-default opacity-80" : ""
                }`}
              />
              <div className="flex justify-between text-xs text-[var(--slate-11)] font-mono">
                <span>{formatTime(currentPos)}</span>
                <span>{formatTime(totalDuration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between pt-1">
              {/* Play / Next / Prev Controls */}
              <div className="flex items-center gap-2">
                {role === "host" ? (
                  <>
                    <button
                      onClick={hostEngine.prevTrack}
                      className="flex h-8 w-8 items-center justify-center rounded text-[var(--slate-11)] hover:text-[var(--slate-12)] hover:bg-[var(--slate-4)] transition-colors duration-200"
                      title="上一首"
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      onClick={hostEngine.togglePlay}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--slate-12)] text-[var(--slate-1)] hover:bg-white transition-colors duration-200"
                      title={playing ? "暂停" : "播放"}
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>
                    <button
                      onClick={hostEngine.nextTrack}
                      className="flex h-8 w-8 items-center justify-center rounded text-[var(--slate-11)] hover:text-[var(--slate-12)] hover:bg-[var(--slate-4)] transition-colors duration-200"
                      title="下一首"
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--slate-11)]">
                      {playing ? "正在收听房主广播" : "房主暂未播放"}
                    </span>
                  </div>
                )}
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (role === "host") {
                      hostEngine.setVolume(hostEngine.volume > 0 ? 0 : 0.8);
                    } else {
                      const next = listenerVolume > 0 ? 0 : 0.8;
                      setListenerVolume(next);
                      sync.setRemoteVolume(next);
                    }
                  }}
                  className="text-[var(--slate-11)] hover:text-[var(--slate-12)] transition-colors duration-200"
                >
                  {(role === "host" ? hostEngine.volume === 0 : listenerVolume === 0) ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={role === "host" ? hostEngine.volume : listenerVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (role === "host") {
                      hostEngine.setVolume(val);
                    } else {
                      setListenerVolume(val);
                      sync.setRemoteVolume(val);
                    }
                  }}
                  className="w-16 h-1 rounded bg-[var(--slate-5)] cursor-pointer"
                  title="本地收听音量"
                />
              </div>
            </div>
          </section>

          {/* Host Playlist & File Picker */}
          {role === "host" && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--slate-11)]">播放列表</span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-[var(--blue-11)] hover:text-[var(--blue-9)] transition-colors duration-200"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>添加本地歌曲</span>
                </button>
                <input
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) hostEngine.loadFiles(e.target.files);
                  }}
                />
              </div>

              {hostEngine.playlist.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 rounded border-[0.5px] border-dashed border-[var(--slate-6)] bg-[var(--slate-2)] p-6 text-center cursor-pointer hover:border-[var(--slate-7)] transition-colors duration-200"
                >
                  <Upload className="h-5 w-5 text-[var(--slate-9)]" />
                  <span className="text-xs text-[var(--slate-11)]">拖拽音频文件至此，或点击浏览</span>
                  <span className="text-[12px] text-[var(--slate-9)]">支持 MP3, FLAC, WAV, OGG, M4A</span>
                </div>
              ) : (
                <div className="flex flex-col rounded bg-[var(--slate-2)] border-[0.5px] border-[var(--slate-6)] divide-y-[0.5px] divide-[var(--slate-6)] max-h-48 overflow-y-auto">
                  {hostEngine.playlist.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={() => hostEngine.selectTrack(index)}
                      className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors duration-200 ${
                        index === hostEngine.currentIndex
                          ? "bg-[var(--slate-4)] text-[var(--blue-11)] font-medium"
                          : "text-[var(--slate-11)] hover:bg-[var(--slate-3)] hover:text-[var(--slate-12)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-[12px] font-mono text-[var(--slate-9)] w-4 text-right">
                          {index + 1}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          hostEngine.removeTrack(index);
                        }}
                        className="text-[var(--slate-9)] hover:text-[var(--ruby-9)] p-1 transition-colors duration-200"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
