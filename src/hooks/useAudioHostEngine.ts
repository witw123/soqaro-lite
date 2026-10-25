import { useState, useRef, useEffect, useCallback } from "react";
import type { TrackItem } from "../types";

export function useAudioHostEngine() {
  const [playlist, setPlaylist] = useState<TrackItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [frequencyData, setFrequencyData] = useState<number[]>(new Array(16).fill(0));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Web Audio graph
  const ensureAudioGraph = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audioRef.current = audio;
    }

    if (!audioContextRef.current) {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);

      // Limiter to prevent clipping and clicks
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-1, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      // Spectrum Analyser
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Host Local Volume Gain
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNodeRef.current = gainNode;

      // WebRTC Stream Destination (Always full scale for listeners)
      const streamDest = ctx.createMediaStreamDestination();
      streamDestRef.current = streamDest;

      // Connect pipeline
      source.connect(compressor);
      compressor.connect(analyser);

      // Local playback branch
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Remote stream branch
      analyser.connect(streamDest);

      audioContextRef.current = ctx;
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  }, [volume]);

  // Visualizer loop
  useEffect(() => {
    if (!isPlaying) {
      setFrequencyData(new Array(16).fill(0));
      return;
    }

    const dataArray = new Uint8Array(16);
    const updateSpectrum = () => {
      if (analyserRef.current && isPlaying) {
        analyserRef.current.getByteFrequencyData(dataArray);
        // Normalize 0-255 to 0-1
        setFrequencyData(Array.from(dataArray.slice(0, 16)).map((v) => v / 255));
      }
      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    };

    animFrameRef.current = requestAnimationFrame(updateSpectrum);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Sync audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      // Play next track
      setPlaylist((prev) => {
        setCurrentIndex((curr) => {
          if (curr + 1 < prev.length) {
            return curr + 1;
          }
          setIsPlaying(false);
          return curr;
        });
        return prev;
      });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Update track when currentIndex changes
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      ensureAudioGraph();
      const track = playlist[currentIndex];
      if (audioRef.current && track) {
        audioRef.current.src = track.url;
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => console.warn("Autoplay prevented:", e));
      }
    }
  }, [currentIndex, playlist, ensureAudioGraph]);

  // Volume change
  const handleSetVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(clamped, audioContextRef.current.currentTime);
    }
  }, []);

  // Controls
  const loadFiles = useCallback((files: FileList | File[]) => {
    const newItems: TrackItem[] = Array.from(files)
      .filter((file) => file.type.startsWith("audio/") || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.name))
      .map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        name: file.name.replace(/\.[^/.]+$/, ""),
        file,
        url: URL.createObjectURL(file),
        duration: 0,
        size: file.size,
      }));

    if (newItems.length > 0) {
      setPlaylist((prev) => {
        const next = [...prev, ...newItems];
        if (prev.length === 0) {
          setCurrentIndex(0);
        }
        return next;
      });
    }
  }, []);

  const togglePlay = useCallback(() => {
    ensureAudioGraph();
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioGraph]);

  const seek = useCallback((targetTime: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(targetTime)) {
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  }, []);

  const nextTrack = useCallback(() => {
    if (currentIndex + 1 < playlist.length) {
      setCurrentIndex((idx) => idx + 1);
    }
  }, [currentIndex, playlist.length]);

  const prevTrack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((idx) => idx - 1);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [currentIndex]);

  const selectTrack = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentIndex(index);
    }
  }, [playlist.length]);

  const removeTrack = useCallback((index: number) => {
    setPlaylist((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      const next = prev.filter((_, i) => i !== index);
      if (index === currentIndex) {
        if (next.length > 0) {
          setCurrentIndex(Math.min(index, next.length - 1));
        } else {
          setCurrentIndex(-1);
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.src = "";
        }
      } else if (index < currentIndex) {
        setCurrentIndex((curr) => curr - 1);
      }
      return next;
    });
  }, [currentIndex]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close();
      }
    };
  }, []);

  return {
    playlist,
    currentTrack: currentIndex >= 0 ? playlist[currentIndex] : null,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    frequencyData,
    mediaStream: streamDestRef.current?.stream || null,
    loadFiles,
    togglePlay,
    seek,
    setVolume: handleSetVolume,
    nextTrack,
    prevTrack,
    selectTrack,
    removeTrack,
  };
}
