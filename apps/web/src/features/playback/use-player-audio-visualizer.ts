"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PlaybackSnapshot } from "@soqaro/shared";
import { audioVisualizerStore } from "./audio-visualizer-store";

const analyserFftSize = 256;
const analyserSmoothingTimeConstant = 0.75;
const desktopSampleCount = 64;
const mobileSampleCount = 40;
const desktopViewportWidth = 1024;
const playbackVisualizerFps = 30;
const reducedMotionVisualizerFps = 10;
const pausedVisualizerFps = 10;
const pausedDecayFactor = 0.8;
const pausedFloorAmplitude = 0.035;
const idleFloorAmplitude = 0.018;
const idleWaveCycles = 1.5;
const maximumCanvasDevicePixelRatio = 1.5;

export type PlayerAudioVisualizerRenderMode = "live" | "paused" | "idle" | "reduced-motion";

export type PlayerAudioVisualizerState = {
  isActive: boolean;
  renderMode: PlayerAudioVisualizerRenderMode;
  reducedMotion: boolean;
  maxDevicePixelRatio: number;
};

type UsePlayerAudioVisualizerInput = {
  audioRef: RefObject<HTMLAudioElement | null>;
  outputStream?: MediaStream | null;
  playbackStatus: PlaybackSnapshot["status"] | null | undefined;
  currentTrackId: string | null | undefined;
  mediaEpoch?: number | null;
  sourcePeerId?: string | null;
  sourceSessionId?: string | null;
};

type VisualizerSourceSelection =
  | {
      kind: "local-stream";
      stream: MediaStream;
      element: HTMLAudioElement | null;
      graphKey: string;
      hasSignal: boolean;
    }
  | {
      kind: "none";
      stream: null;
      element: null;
      graphKey: "none";
      hasSignal: false;
    };

type VisualizerGraph = {
  key: string;
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
};

const mediaStreamIdentityMap = new WeakMap<MediaStream, string>();
let mediaStreamIdentitySequence = 0;

function asMediaStream(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return typeof (value as MediaStream).getAudioTracks === "function"
    ? (value as MediaStream)
    : null;
}

function getMediaStreamIdentity(stream: MediaStream) {
  const existing = mediaStreamIdentityMap.get(stream);
  if (existing) {
    return existing;
  }

  mediaStreamIdentitySequence += 1;
  const nextIdentity = `stream-${mediaStreamIdentitySequence}`;
  mediaStreamIdentityMap.set(stream, nextIdentity);
  return nextIdentity;
}

function hasLiveAudioTrack(stream: MediaStream | null | undefined) {
  if (!stream || typeof stream.getAudioTracks !== "function") {
    return false;
  }

  return stream
    .getAudioTracks()
    .some((track) => track.readyState === "live" && track.enabled !== false);
}

function resolveVisualizerGraphKey(input: {
  currentTrackId: string;
  mediaEpoch?: number | null;
  sourcePeerId?: string | null;
  sourceSessionId?: string | null;
  sourceIdentity: string;
}) {
  return [
    input.currentTrackId,
    typeof input.mediaEpoch === "number" ? input.mediaEpoch : "none",
    input.sourceSessionId ?? "none",
    input.sourcePeerId ?? "none",
    input.sourceIdentity
  ].join("|");
}

export function resolveVisualizerSourceSelection(input: {
  audioElement: HTMLAudioElement | null | undefined;
  outputStream?: MediaStream | null;
  currentTrackId: string | null | undefined;
  mediaEpoch?: number | null;
  sourcePeerId?: string | null;
  sourceSessionId?: string | null;
}): VisualizerSourceSelection {
  if (!input.currentTrackId) {
    return {
      kind: "none",
      stream: null,
      element: null,
      graphKey: "none",
      hasSignal: false
    };
  }

  const localElement = input.audioElement ?? null;
  const elementStream = asMediaStream(localElement?.srcObject ?? null);
  const localStream = elementStream ??
    asMediaStream(input.outputStream ?? null);
  if (localStream && hasLiveAudioTrack(localStream)) {
    return {
      kind: "local-stream",
      stream: localStream,
      element: elementStream ? localElement : null,
      graphKey: resolveVisualizerGraphKey({
        currentTrackId: input.currentTrackId,
        mediaEpoch: input.mediaEpoch,
        sourcePeerId: input.sourcePeerId,
        sourceSessionId: input.sourceSessionId,
        sourceIdentity: getMediaStreamIdentity(localStream)
      }),
      hasSignal: true
    };
  }

  return {
    kind: "none",
    stream: null,
    element: null,
    graphKey: "none",
    hasSignal: false
  };
}

export function resolvePlayerAudioVisualizerRenderMode(input: {
  playbackStatus: PlaybackSnapshot["status"] | null | undefined;
  hasTrack: boolean;
  reducedMotion: boolean;
  hasLiveSignal: boolean;
}) : PlayerAudioVisualizerRenderMode {
  if (!input.hasTrack) {
    return "idle";
  }

  if (input.playbackStatus === "playing") {
    return input.reducedMotion ? "reduced-motion" : "live";
  }

  if (input.hasLiveSignal) {
    return input.reducedMotion ? "reduced-motion" : "paused";
  }

  return "idle";
}

export function resolvePlayerAudioVisualizerSampleCount(viewportWidth: number) {
  return viewportWidth >= desktopViewportWidth ? desktopSampleCount : mobileSampleCount;
}

export function buildIdleWaveformSamples(sampleCount: number, amplitude = idleFloorAmplitude) {
  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const envelope = 0.72 + 0.28 * Math.sin(progress * Math.PI);
    const wave = Math.sin(progress * Math.PI * idleWaveCycles * 2);
    return Math.max(0.01, amplitude * envelope * (0.5 + Math.abs(wave)));
  });
}

export function normalizeWaveformSamples(input: {
  timeDomainData: ArrayLike<number>;
  sampleCount: number;
  reducedMotion?: boolean;
  floorAmplitude?: number;
}) {
  const { timeDomainData, sampleCount } = input;
  if (sampleCount <= 0 || timeDomainData.length === 0) {
    return [];
  }

  const bucketSize = Math.max(1, Math.floor(timeDomainData.length / sampleCount));
  const floorAmplitude = input.floorAmplitude ?? idleFloorAmplitude;
  const normalized = new Array(sampleCount).fill(0);

  for (let index = 0; index < sampleCount; index += 1) {
    const start = index * bucketSize;
    const end =
      index === sampleCount - 1
        ? timeDomainData.length
        : Math.min(timeDomainData.length, start + bucketSize);
    let peak = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      const centered = (timeDomainData[cursor] - 128) / 128;
      peak = Math.max(peak, Math.abs(centered));
    }

    const shaped = input.reducedMotion ? peak * 0.8 : peak;
    normalized[index] = Math.max(floorAmplitude, Math.min(1, shaped));
  }

  return normalized;
}

export function decayWaveformSamples(
  samples: number[],
  factor = pausedDecayFactor,
  floorAmplitude = pausedFloorAmplitude
) {
  const idleFloor = buildIdleWaveformSamples(samples.length, floorAmplitude);
  return samples.map((sample, index) => {
    const idleTarget = idleFloor[index] ?? floorAmplitude;
    return Math.max(idleTarget, sample * factor);
  });
}

function clampDevicePixelRatio(devicePixelRatio: number | null | undefined) {
  if (!devicePixelRatio || !Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return 1;
  }

  return Math.min(maximumCanvasDevicePixelRatio, devicePixelRatio);
}

function destroyVisualizerGraph(graph: VisualizerGraph | null) {
  if (!graph) {
    return;
  }

  try {
    graph.source.disconnect();
  } catch {
    // Ignore already-disconnected nodes.
  }

  try {
    graph.analyser.disconnect();
  } catch {
    // Ignore already-disconnected nodes.
  }

  void graph.context.close().catch(() => undefined);
}

function getWindowViewportWidth() {
  if (typeof window === "undefined") {
    return desktopViewportWidth;
  }

  return window.innerWidth;
}

function commitVisualizerIdle(samples: number[], reason: string | null = null) {
  audioVisualizerStore.samples = samples;
  audioVisualizerStore.averageEnergy = 0;
  audioVisualizerStore.peakEnergy = 0;
  audioVisualizerStore.hasLiveGraph = false;
  audioVisualizerStore.sourceKind = "none";
  audioVisualizerStore.graphKey = null;
  audioVisualizerStore.lastError = reason;
}

function commitVisualizerSamples(input: {
  samples: number[];
  sourceKind: typeof audioVisualizerStore.sourceKind;
  graphKey: string;
  lastError?: string | null;
}) {
  let peakEnergy = 0;
  let totalEnergy = 0;
  for (const sample of input.samples) {
    const normalizedSample = Math.max(0, sample);
    peakEnergy = Math.max(peakEnergy, normalizedSample);
    totalEnergy += normalizedSample;
  }

  audioVisualizerStore.samples = input.samples;
  audioVisualizerStore.averageEnergy =
    input.samples.length > 0 ? totalEnergy / input.samples.length : 0;
  audioVisualizerStore.peakEnergy = peakEnergy;
  audioVisualizerStore.sourceKind = input.sourceKind;
  audioVisualizerStore.graphKey = input.graphKey;
  audioVisualizerStore.hasLiveGraph = true;
  audioVisualizerStore.lastError = input.lastError ?? null;
}

export function usePlayerAudioVisualizer(
  input: UsePlayerAudioVisualizerInput
): PlayerAudioVisualizerState {
  // Sampling results are published to audioVisualizerStore only; keeping them out of
  // React state avoids a 30fps re-render of the whole player subtree for data that
  // canvas consumers read imperatively.
  const pausedSamplesRef = useRef<number[] | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(getWindowViewportWidth);
  const graphRef = useRef<VisualizerGraph | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const timeDomainBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const sampleCount = resolvePlayerAudioVisualizerSampleCount(viewportWidth);
  const idleSamples = useMemo(() => buildIdleWaveformSamples(sampleCount), [sampleCount]);
  const sourceSelection = resolveVisualizerSourceSelection({
    audioElement: input.audioRef.current,
    outputStream: input.outputStream,
    currentTrackId: input.currentTrackId,
    mediaEpoch: input.mediaEpoch,
    sourcePeerId: input.sourcePeerId,
    sourceSessionId: input.sourceSessionId
  });
  const renderMode = resolvePlayerAudioVisualizerRenderMode({
    playbackStatus: input.playbackStatus,
    hasTrack: !!input.currentTrackId,
    reducedMotion,
    hasLiveSignal: sourceSelection.hasSignal
  });
  const sampleIntervalMs =
    renderMode === "reduced-motion"
      ? Math.round(1000 / reducedMotionVisualizerFps)
      : renderMode === "paused"
        ? Math.round(1000 / pausedVisualizerFps)
        : Math.round(1000 / playbackVisualizerFps);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mediaQuery.matches);
    apply();

    const listener = () => apply();
    mediaQuery.addEventListener?.("change", listener);
    return () => mediaQuery.removeEventListener?.("change", listener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (pausedSamplesRef.current && pausedSamplesRef.current.length !== sampleCount) {
      pausedSamplesRef.current = null;
    }
  }, [sampleCount]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      destroyVisualizerGraph(graphRef.current);
      graphRef.current = null;
      commitVisualizerIdle(idleSamples);
    };
  }, [idleSamples]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const stopGraphIfIdle = (reason: string | null = null) => {
      if (renderMode === "idle" || !isPageVisible || sourceSelection.kind === "none") {
        destroyVisualizerGraph(graphRef.current);
        graphRef.current = null;
        timeDomainBufferRef.current = null;
        commitVisualizerIdle(idleSamples, reason);
      }
    };

    if (!isPageVisible) {
      stopGraphIfIdle("page-hidden");
      return;
    }

    let disposed = false;

    const ensureGraph = async () => {
      if (sourceSelection.kind === "none") {
        stopGraphIfIdle("no-visualizer-source");
        return null;
      }

      const currentGraph = graphRef.current;
      if (currentGraph && currentGraph.key === sourceSelection.graphKey) {
        if (currentGraph.context.state === "suspended") {
          await currentGraph.context.resume().catch(() => undefined);
        }
        return currentGraph;
      }

      destroyVisualizerGraph(currentGraph);
      graphRef.current = null;
      timeDomainBufferRef.current = null;

      const sourceStream = sourceSelection.stream;
      if (!sourceStream) {
        audioVisualizerStore.lastError = "visualizer-stream-unavailable";
        return null;
      }

      const AudioContextCtor =
        window.AudioContext ??
        ((window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
          null);
      if (!AudioContextCtor) {
        audioVisualizerStore.lastError = "visualizer-audiocontext-unavailable";
        return null;
      }

      try {
        const context = new AudioContextCtor();
        const source = context.createMediaStreamSource(sourceStream);
        const analyser = context.createAnalyser();
        analyser.fftSize = analyserFftSize;
        analyser.smoothingTimeConstant = analyserSmoothingTimeConstant;
        source.connect(analyser);
        if (context.state === "suspended") {
          await context.resume().catch(() => undefined);
        }
        const graph = {
          key: sourceSelection.graphKey,
          context,
          analyser,
          source,
          stream: sourceStream
        } satisfies VisualizerGraph;
        if (disposed) {
          destroyVisualizerGraph(graph);
          return null;
        }
        graphRef.current = graph;
        timeDomainBufferRef.current = new Uint8Array(new ArrayBuffer(graph.analyser.fftSize));
        audioVisualizerStore.lastError = null;
        return graph;
      } catch {
        audioVisualizerStore.lastError = "visualizer-graph-create-failed";
        return null;
      }
    };

    const scheduleNextFrame = (callback: () => void) => {
      timeoutRef.current = window.setTimeout(() => {
        animationFrameRef.current = window.requestAnimationFrame(callback);
      }, sampleIntervalMs);
    };

    const sampleLive = async () => {
      if (disposed) {
        return;
      }

      if (renderMode !== "live" && renderMode !== "reduced-motion") {
        scheduleNextFrame(tick);
        return;
      }

      const graph = await ensureGraph();
      const timeDomainBuffer = timeDomainBufferRef.current;
      if (!graph || !timeDomainBuffer) {
        commitVisualizerIdle(idleSamples, audioVisualizerStore.lastError ?? "visualizer-graph-missing");
        pausedSamplesRef.current = idleSamples;
        scheduleNextFrame(tick);
        return;
      }

      graph.analyser.getByteTimeDomainData(timeDomainBuffer);
      const nextSamples = normalizeWaveformSamples({
        timeDomainData: timeDomainBuffer,
        sampleCount,
        reducedMotion: renderMode === "reduced-motion"
      });
      commitVisualizerSamples({
        samples: nextSamples,
        sourceKind: sourceSelection.kind,
        graphKey: sourceSelection.graphKey
      });
      pausedSamplesRef.current = nextSamples;
      scheduleNextFrame(tick);
    };

    const tickPaused = () => {
      if (disposed) {
        return;
      }

      const current = pausedSamplesRef.current ?? audioVisualizerStore.samples;
      const nextSamples =
        current.length === sampleCount
          ? decayWaveformSamples(current, pausedDecayFactor, pausedFloorAmplitude)
          : buildIdleWaveformSamples(sampleCount, pausedFloorAmplitude);
      pausedSamplesRef.current = nextSamples;
      commitVisualizerSamples({
        samples: nextSamples,
        sourceKind: sourceSelection.kind === "none" ? "none" : sourceSelection.kind,
        graphKey: sourceSelection.kind === "none" ? "none" : sourceSelection.graphKey
      });
      scheduleNextFrame(tick);
    };

    const tickIdle = () => {
      if (disposed) {
        return;
      }

      stopGraphIfIdle("visualizer-idle");
      pausedSamplesRef.current = idleSamples;
    };

    const tick = () => {
      if (renderMode === "live" || renderMode === "reduced-motion") {
        void sampleLive();
        return;
      }

      if (renderMode === "paused") {
        tickPaused();
        return;
      }

      tickIdle();
    };

    tick();

    return () => {
      disposed = true;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      stopGraphIfIdle();
    };
  }, [
    idleSamples,
    isPageVisible,
    renderMode,
    sampleCount,
    sampleIntervalMs,
    sourceSelection.graphKey,
    sourceSelection.hasSignal,
    sourceSelection.kind,
    sourceSelection.element,
    sourceSelection.stream,
    input.outputStream
  ]);

  return {
    isActive: isPageVisible && (renderMode === "live" || renderMode === "reduced-motion"),
    renderMode,
    reducedMotion,
    maxDevicePixelRatio: clampDevicePixelRatio(
      typeof window === "undefined" ? 1 : window.devicePixelRatio
    )
  };
}
