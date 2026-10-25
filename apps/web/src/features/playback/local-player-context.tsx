"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import type {
  PlaybackMode,
  PlaybackSnapshot,
  QueueItem,
  TrackMeta
} from "@soqaro/shared";
import { takeNextShuffleTrack, synchronizeShuffleBagTrackIds } from "@soqaro/shared";
import { getCachedLibraryTrackSummary, type LocalPlaylistTrackRecord } from "@/features/library/indexeddb";
import {
  cacheProviderTrackForPlayback,
  providerPlaybackCacheChangedEvent,
  releaseProviderTrackPlaybackCache
} from "@/features/playback/provider-track-cache";
import { prepareTrackForImmediatePlayback } from "./provider-playback-preparation";
import { canPrepareProviderTrack, getQueuePreloadWindow, QueuePreloader } from "./queue-preload";
import { listMergedLocalPlaylistTracks, toCachedProviderTrack } from "@/features/playlist/local-playlist";
import { roomAudioOutput } from "@/features/playback/room-audio-output";
import {
  appSettingsChangeEvent,
  getAppSettings,
  updateAppSettings
} from "@/features/settings/settings-store";
import { resolveLoudnessGainDb } from "./loudness";
import {
  buildLocalPlaybackSnapshot,
  buildLocalQueueItemId,
  enrichTrackMetadata,
  loadLocalAudioFile,
  localQueueOwnerId,
  mergeLocalTrackRecord,
  toTrackMeta
} from "./local-player-track-utils";
import { soqaroApi } from "@/lib/network/soqaro-api";

type LocalPlayerContextValue = {
  audioRef: RefObject<HTMLAudioElement | null>;
  playback: PlaybackSnapshot | null;
  currentTrack: TrackMeta | null;
  seekDraft: number | null;
  setSeekDraft: (value: number | null) => void;
  audioDurationMs: number;
  volume: number;
  setVolume: (value: number) => void;
  syncProgressFromAudio: () => void;
  syncDurationFromAudio: () => void;
  tracks: TrackMeta[];
  queue: QueueItem[];
  currentQueueItemId: string | null;
  canControlPlayback: boolean;
  canSeekPlayback: boolean;
  playbackMode: PlaybackMode;
  isTrackPlayable: (track: LocalPlaylistTrackRecord) => boolean;
  addToQueue: (track: LocalPlaylistTrackRecord) => void;
  playTrack: (track: LocalPlaylistTrackRecord) => Promise<void>;
  playTracks: (tracks: LocalPlaylistTrackRecord[], startIndex?: number) => Promise<void>;
  onPlay: () => void;
  onPause: (positionMs?: number) => void;
  onSeek: (positionMs: number) => Promise<PlaybackSnapshot | null>;
  onPrev: () => void;
  onNext: () => void;
  onCyclePlaybackMode: () => void;
  onPlayQueueItem: (queueItemId: string) => Promise<void>;
  onPlayNextQueueItem: (queueItemId: string) => Promise<void>;
  onRemoveQueueItem: (queueItemId: string) => Promise<void>;
  onReorderQueue: (queueItemIds: string[]) => Promise<void>;
};

const LocalPlayerContext = createContext<LocalPlayerContextValue | null>(null);

/**
 * Playback progress changes ~4x/second while playing. Keeping it out of the main
 * context value stops every useLocalPlayer consumer from re-rendering on each tick;
 * only progress-aware subscribers (the persistent player) use this context.
 */
const LocalPlayerProgressContext = createContext(0);

export function LocalPlayerProvider({ children, active }: { children: ReactNode; active: boolean }) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const queueRef = useRef<LocalPlaylistTrackRecord[]>([]);
  const playbackRecordsRef = useRef<LocalPlaylistTrackRecord[]>([]);
  const playbackSequenceKindRef = useRef<"queue" | "direct" | "playlist">("direct");
  const currentRecordRef = useRef<LocalPlaylistTrackRecord | null>(null);
  const currentIndexRef = useRef(0);
  const nextQueueItemIdRef = useRef<string | null>(null);
  const shuffleBagRef = useRef<string[]>([]);
  const playRequestRef = useRef(0);
  const playAbortRef = useRef<AbortController | null>(null);
  const preparingTrackIdRef = useRef<string | null>(null);
  const queuePreloaderRef = useRef<QueuePreloader | null>(null);
  const metadataEnrichedHashesRef = useRef(new Set<string>());
  const progressRef = useRef(0);
  const revisionRef = useRef(0);
  const mediaEpochRef = useRef(0);
  const [queueRecords, setQueueRecords] = useState<LocalPlaylistTrackRecord[]>([]);
  const [libraryRecords, setLibraryRecords] = useState<LocalPlaylistTrackRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<LocalPlaylistTrackRecord | null>(null);
  const [playback, setPlayback] = useState<PlaybackSnapshot | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loudnessNormalization, setLoudnessNormalization] = useState(false);
  const lastSettingsDefaultVolumeRef = useRef<number | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("sequence");
  const loudnessGainDb = resolveLoudnessGainDb(
    currentRecord,
    loudnessNormalization
  );

  const refreshLibraryRecords = useCallback(async () => {
    const tracks = await listMergedLocalPlaylistTracks();
    setLibraryRecords(tracks);
    return tracks;
  }, []);

  useEffect(() => {
    queueRef.current = queueRecords;
  }, [queueRecords]);

  useEffect(() => {
    currentRecordRef.current = currentRecord;
  }, [currentRecord]);

  useEffect(() => {
    progressRef.current = progressMs;
  }, [progressMs]);

  useEffect(() => {
    setPlayback((current) => current ? { ...current, playbackMode } : current);
  }, [playbackMode]);

  useEffect(() => {
    if (playbackMode !== "shuffle") {
      shuffleBagRef.current = [];
      return;
    }

    shuffleBagRef.current = synchronizeShuffleBagTrackIds(
      shuffleBagRef.current,
      playbackRecordsRef.current.map((track) => track.id),
      currentRecordRef.current?.id ?? null,
      playbackRecordsRef.current.map((track) => track.id)
    );
  }, [playbackMode]);

  useEffect(() => {
    const syncPlaybackSettings = () => {
      const settings = getAppSettings();
      const defaultVolumeChanged = lastSettingsDefaultVolumeRef.current === null ||
        lastSettingsDefaultVolumeRef.current !== settings.playback.defaultVolume;
      lastSettingsDefaultVolumeRef.current = settings.playback.defaultVolume;
      if (defaultVolumeChanged) {
        setVolume(settings.playback.defaultVolume);
      }
      setLoudnessNormalization(settings.playback.loudnessNormalization);
      setPlaybackMode(settings.playback.localPlaybackMode);
    };
    syncPlaybackSettings();
    window.addEventListener(appSettingsChangeEvent, syncPlaybackSettings);
    window.addEventListener("storage", syncPlaybackSettings);
    return () => {
      window.removeEventListener(appSettingsChangeEvent, syncPlaybackSettings);
      window.removeEventListener("storage", syncPlaybackSettings);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      void refreshLibraryRecords().catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) refresh();
    };

    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshLibraryRecords]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      playRequestRef.current += 1;
      playAbortRef.current?.abort();
      audio?.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const isTrackPlayable = useCallback(
    (track: LocalPlaylistTrackRecord) => canPrepareProviderTrack(track) ||
      Boolean(track.fileHash && (track.availableOffline || track.fileName)),
    []
  );

  const createPlaybackSnapshot = useCallback(
    (input: {
      record: LocalPlaylistTrackRecord | null;
      status: PlaybackSnapshot["status"];
      positionMs: number;
      startedAt?: string | null;
    }): PlaybackSnapshot | null => {
      if (!input.record) return null;

      revisionRef.current += 1;
      return buildLocalPlaybackSnapshot({
        ...input,
        playbackMode,
        playbackRevision: revisionRef.current,
        mediaEpoch: mediaEpochRef.current,
        nextQueueItemId: nextQueueItemIdRef.current,
        queue: queueRef.current
      });
    },
    [playbackMode]
  );

  const loadAudioFile = useCallback(
    (track: LocalPlaylistTrackRecord) => loadLocalAudioFile(track),
    []
  );

  const enrichTrack = useCallback(
    (track: LocalPlaylistTrackRecord, file: Blob) =>
      enrichTrackMetadata(track, file, metadataEnrichedHashesRef.current),
    []
  );

  const playRecords = useCallback(async (
    records: LocalPlaylistTrackRecord[],
    startIndex = 0,
    sequenceKind: "queue" | "direct" | "playlist" = "direct"
  ) => {
    if (!activeRef.current) return;
    nextQueueItemIdRef.current = null;
    let nextRecords = records.filter((track, index, list) =>
      list.findIndex((candidate) => candidate.id === track.id) === index
    );
    if (nextRecords.length === 0) return;

    const requestId = ++playRequestRef.current;
    playAbortRef.current?.abort();
    const controller = new AbortController();
    playAbortRef.current = controller;
    const normalizedStartIndex = Math.min(Math.max(0, startIndex), nextRecords.length - 1);
    const shouldSkipMissingFiles = sequenceKind !== "direct" && playbackMode !== "single";
    const shouldWrapSequence = sequenceKind !== "direct" && playbackMode !== "shuffle" && playbackMode !== "single";
    const candidateCount = shouldSkipMissingFiles ? nextRecords.length : 1;
    let selectedIndex = normalizedStartIndex;
    let record: LocalPlaylistTrackRecord | undefined;
    let file: Blob | null = null;

    for (let offset = 0; offset < candidateCount; offset += 1) {
      const candidateIndex = playbackMode === "shuffle" || shouldWrapSequence
        ? (normalizedStartIndex + offset) % nextRecords.length
        : normalizedStartIndex + offset;
      if (candidateIndex >= nextRecords.length) break;
      let candidate = nextRecords[candidateIndex];
      preparingTrackIdRef.current = candidate.id;
      if (canPrepareProviderTrack(candidate)) {
        try {
          candidate = (await prepareTrackForImmediatePlayback(candidate, {
            signal: controller.signal
          })).record;
        } catch {
          if (requestId !== playRequestRef.current || controller.signal.aborted) return;
          continue;
        }
      }
      const candidateFile = await loadAudioFile(candidate).catch(() => null);
      if (requestId !== playRequestRef.current) return;
      const isPlayableBilibiliStream = !candidateFile && candidate.provider === "bilibili" && !!candidate.providerTrackId;
      if (candidateFile || isPlayableBilibiliStream) {
        nextRecords = nextRecords.map((item, index) => index === candidateIndex ? candidate : item);
        selectedIndex = candidateIndex;
        record = candidate;
        file = candidateFile;
        break;
      }
    }

    if (requestId !== playRequestRef.current || !activeRef.current) return;
    preparingTrackIdRef.current = null;
    const isBilibiliStream = !file && record?.provider === "bilibili" && !!record.providerTrackId;
    if (!record || (!file && !isBilibiliStream)) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const mediaSourceUrl = file
      ? URL.createObjectURL(file)
      : soqaroApi.getBilibiliAudioStreamUrl(record.providerTrackId!);
    if (file) {
      objectUrlRef.current = mediaSourceUrl;
    }
    mediaEpochRef.current += 1;
    playbackSequenceKindRef.current = sequenceKind;
    if (playbackMode === "shuffle") {
      shuffleBagRef.current = shuffleBagRef.current.filter((trackId) => trackId !== record.id);
    }
    const nextQueue = queueRef.current.map((item) =>
      item.id === record?.id ? record : item
    );
    if (nextQueue.some((item, index) => item !== queueRef.current[index])) {
      queueRef.current = nextQueue;
      setQueueRecords(nextQueue);
    }
    playbackRecordsRef.current = sequenceKind === "queue" ? nextQueue : nextRecords;
    currentIndexRef.current = sequenceKind === "queue"
      ? nextQueue.findIndex((item) => item.id === record.id)
      : selectedIndex;
    setLibraryRecords((current) => current.map((item) =>
      item.id === record?.id || (!!item.fileHash && item.fileHash === record?.fileHash)
        ? record!
        : item
    ));
    currentRecordRef.current = record;
    setCurrentRecord(record);
    setProgressMs(0);
    setSeekDraft(null);
    setAudioDurationMs(record.durationMs);
    setPlayback(createPlaybackSnapshot({ record, status: "paused", positionMs: 0 }));

    audio.pause();
    audio.src = mediaSourceUrl;
    audio.load();

    // 如果是通过流式直接起播的 B 站音轨，触发后台静默写入本地缓存供后续离线使用
    if (isBilibiliStream) {
      const providerTrack = toCachedProviderTrack(record);
      if (providerTrack) {
        void cacheProviderTrackForPlayback(providerTrack).then((cached) => {
          setLibraryRecords((current) => current.map((item) =>
            item.id === cached.id ? cached : item
          ));
        }).catch(() => undefined);
      }
    }

    roomAudioOutput.applyVolume({
      localAudio: audio,
      volume,
      loudnessGainDb: resolveLoudnessGainDb(record, loudnessNormalization)
    });
    const playResult = await roomAudioOutput.playElement(audio, {
      force: true,
      isCurrent: () => activeRef.current && requestId === playRequestRef.current
    });
    if (!activeRef.current) {
      audio.pause();
      return;
    }
    if (playResult.ok) {
      if (requestId !== playRequestRef.current) return;
      const startedAt = new Date(Date.now() - audio.currentTime * 1000).toISOString();
      setPlayback(createPlaybackSnapshot({
        record,
        status: "playing",
        positionMs: audio.currentTime * 1000,
        startedAt
      }));
    } else {
      if (requestId !== playRequestRef.current) return;
      // Keep the selected track visible so the next explicit play click can
      // retry after a browser autoplay policy rejection.
      setPlayback(createPlaybackSnapshot({ record, status: "paused", positionMs: 0 }));
    }
    // Metadata parsing must not delay binding or starting the audio element.
    const playingRecord = record;
    if (canPrepareProviderTrack(playingRecord) || !file) return;
    void enrichTrack(playingRecord, file).then((enriched) => {
      if (requestId !== playRequestRef.current) return;
      currentRecordRef.current = enriched;
      setCurrentRecord(enriched);
      const nextQueue = queueRef.current.map((item) =>
        item.id === enriched.id ? enriched : item
      );
      queueRef.current = nextQueue;
      setQueueRecords(nextQueue);
    }).catch(() => undefined);
  }, [
    createPlaybackSnapshot,
    enrichTrack,
    loadAudioFile,
    loudnessNormalization,
    playbackMode,
    volume
  ]);

  const playTrack = useCallback(async (inputTrack: LocalPlaylistTrackRecord) => {
    if (!activeRef.current) throw new Error("请先退出房间，再播放个人歌曲。");
    const track = mergeLocalTrackRecord(inputTrack, libraryRecords);
    const existingIndex = queueRef.current.findIndex((candidate) => candidate.id === track.id);
    if (existingIndex >= 0) {
      await playRecords(queueRef.current, existingIndex, "queue");
      return;
    }

    const nextQueue = [...queueRef.current, track];
    queueRef.current = nextQueue;
    setQueueRecords(nextQueue);
    if (playbackMode === "shuffle") {
      shuffleBagRef.current = synchronizeShuffleBagTrackIds(
        shuffleBagRef.current,
        nextQueue.map((item) => item.id),
        currentRecordRef.current?.id ?? null,
        [track.id]
      );
    }
    await playRecords(nextQueue, nextQueue.length - 1, "queue");
  }, [libraryRecords, playbackMode, playRecords]);

  const playTracks = useCallback(async (
    tracksToPlay: LocalPlaylistTrackRecord[],
    startIndex = 0
  ) => {
    if (!activeRef.current) throw new Error("请先退出房间，再播放个人歌曲。");
    const resolvedTracks = tracksToPlay.map((track) => mergeLocalTrackRecord(track, libraryRecords));
    const uniqueTracks = resolvedTracks.filter((track, index, list) =>
      list.findIndex((candidate) => candidate.id === track.id) === index
    );
    if (uniqueTracks.length === 0) return;

    const normalizedStartIndex = Math.min(Math.max(0, startIndex), uniqueTracks.length - 1);
    const nextQueue = [...queueRef.current];
    const queueIds = new Set(nextQueue.map((track) => track.id));
    const addedTrackIds: string[] = [];
    for (const track of uniqueTracks) {
      if (!queueIds.has(track.id)) {
        nextQueue.push(track);
        queueIds.add(track.id);
        addedTrackIds.push(track.id);
      }
    }
    queueRef.current = nextQueue;
    setQueueRecords(nextQueue);
    if (playbackMode === "shuffle") {
      shuffleBagRef.current = synchronizeShuffleBagTrackIds(
        shuffleBagRef.current,
        nextQueue.map((track) => track.id),
        currentRecordRef.current?.id ?? null,
        addedTrackIds
      );
    }

    const selectedTrackId = uniqueTracks[normalizedStartIndex]?.id;
    const queueIndex = nextQueue.findIndex((track) => track.id === selectedTrackId);
    if (queueIndex >= 0) {
      await playRecords(nextQueue, queueIndex, "queue");
    }
  }, [libraryRecords, playbackMode, playRecords]);

  const updateQueueRecord = useCallback((record: LocalPlaylistTrackRecord) => {
    const nextQueue = queueRef.current.map((item) =>
      item.id === record.id ? record : item
    );
    if (!nextQueue.some((item, index) => item !== queueRef.current[index])) return;
    queueRef.current = nextQueue;
    setQueueRecords(nextQueue);
    if (playbackSequenceKindRef.current === "queue") {
      playbackRecordsRef.current = nextQueue;
    } else if (playbackSequenceKindRef.current === "direct" && currentRecordRef.current) {
      playbackRecordsRef.current = [
        currentRecordRef.current,
        ...nextQueue.filter((candidate) => candidate.id !== currentRecordRef.current?.id)
      ];
    }
    setLibraryRecords((current) => current.map((item) =>
      item.id === record.id ? record : item
    ));
  }, []);

  useEffect(() => {
    const preloader = new QueuePreloader(updateQueueRecord);
    queuePreloaderRef.current = preloader;
    return () => {
      preloader.dispose();
      queuePreloaderRef.current = null;
    };
  }, [updateQueueRecord]);

  useEffect(() => {
    const nextId = queueRecords.find(
      (track) => buildLocalQueueItemId(track.id) === playback?.nextQueueItemId
    )?.id ?? null;
    queuePreloaderRef.current?.update(active ? getQueuePreloadWindow(
      queueRecords,
      currentRecord?.id ?? null,
      playbackMode,
      nextId,
      shuffleBagRef.current
    ) : []);
  }, [active, queueRecords, currentRecord?.id, playbackMode, playback?.nextQueueItemId]);

  useEffect(() => {
    const refreshMetadata = (event?: Event) => {
      const current = currentRecordRef.current;
      if (!current?.fileHash) return;
      const detail = (event as CustomEvent<{ fileHashes: string[]; kind: string }> | undefined)?.detail;
      if (detail && (detail.kind !== "add" || !detail.fileHashes.includes(current.fileHash))) return;
      void getCachedLibraryTrackSummary(current.fileHash).then((summary) => {
        if (!summary || currentRecordRef.current?.id !== current.id) return;
        const updated = {
          ...currentRecordRef.current,
          artworkUrl: summary.artworkUrl ?? current.artworkUrl,
          lyrics: summary.lyrics ?? current.lyrics,
          translatedLyrics: summary.translatedLyrics ?? current.translatedLyrics,
          romanizedLyrics: summary.romanizedLyrics ?? current.romanizedLyrics,
          loudness: summary.loudness ?? current.loudness
        };
        currentRecordRef.current = updated;
        setCurrentRecord(updated);
        updateQueueRecord(updated);
      }).catch(() => undefined);
    };
    refreshMetadata();
    window.addEventListener(providerPlaybackCacheChangedEvent, refreshMetadata);
    return () => window.removeEventListener(providerPlaybackCacheChangedEvent, refreshMetadata);
  }, [currentRecord?.id, updateQueueRecord]);

  const addToQueue = useCallback((inputTrack: LocalPlaylistTrackRecord) => {
    const track = mergeLocalTrackRecord(inputTrack, libraryRecords);
    if (queueRef.current.some((candidate) => candidate.id === track.id)) {
      return;
    }

    const nextQueue = [...queueRef.current, track];
    queueRef.current = nextQueue;
    setQueueRecords(nextQueue);

    if (playbackSequenceKindRef.current === "queue") {
      const currentId = currentRecordRef.current?.id;
      playbackRecordsRef.current = nextQueue;
      currentIndexRef.current = Math.max(
        0,
        nextQueue.findIndex((candidate) => candidate.id === currentId)
      );
    } else if (
      playbackSequenceKindRef.current === "direct" &&
      currentRecordRef.current
    ) {
      playbackRecordsRef.current = [
        currentRecordRef.current,
        ...nextQueue.filter((candidate) => candidate.id !== currentRecordRef.current?.id)
      ];
      currentIndexRef.current = 0;
    }
    if (playbackMode === "shuffle") {
      shuffleBagRef.current = synchronizeShuffleBagTrackIds(
        shuffleBagRef.current,
        playbackRecordsRef.current.map((item) => item.id),
        currentRecordRef.current?.id ?? null,
        [track.id]
      );
    }
  }, [libraryRecords, playbackMode]);

  const onPlay = useCallback(async () => {
    if (!activeRef.current) return;
    const record = currentRecordRef.current;
    const audio = audioRef.current;
    if (!audio) return;

    if (!record) {
      const records = queueRef.current.length > 0
        ? queueRef.current
        : await refreshLibraryRecords().catch(() => libraryRecords);
      const preferredQueueIndex = nextQueueItemIdRef.current
        ? records.findIndex(
            (track) => buildLocalQueueItemId(track.id) === nextQueueItemIdRef.current
          )
        : -1;
      const firstQueueIndex = preferredQueueIndex >= 0
        ? preferredQueueIndex
        : records.findIndex((track) => Boolean(track.fileHash) || canPrepareProviderTrack(track));
      if (firstQueueIndex >= 0) {
        if (queueRef.current.length === 0) {
          queueRef.current = records;
          setQueueRecords(records);
        }
        await playRecords(records, firstQueueIndex, "queue");
      }
      return;
    }

    const requestId = ++playRequestRef.current;
    void roomAudioOutput.playElement(audio, {
      force: true,
      isCurrent: () => activeRef.current && requestId === playRequestRef.current
    })
      .then((result) => {
        if (!activeRef.current) {
          audio.pause();
          return;
        }
        if (!result.ok || requestId !== playRequestRef.current) return;
        setPlayback(createPlaybackSnapshot({
          record,
          status: "playing",
          positionMs: audio.currentTime * 1000,
          startedAt: new Date(Date.now() - audio.currentTime * 1000).toISOString()
        }));
      });
  }, [createPlaybackSnapshot, libraryRecords, playRecords, refreshLibraryRecords]);

  const onPause = useCallback((positionMs?: number) => {
    playRequestRef.current += 1;
    if (preparingTrackIdRef.current) {
      playAbortRef.current?.abort();
      preparingTrackIdRef.current = null;
    }
    const record = currentRecordRef.current;
    const audio = audioRef.current;
    if (!record || !audio) return;

    audio.pause();
    const nextPositionMs = positionMs ?? audio.currentTime * 1000;
    setProgressMs(nextPositionMs);
    setPlayback(createPlaybackSnapshot({ record, status: "paused", positionMs: nextPositionMs }));
  }, [createPlaybackSnapshot]);

  // Keep the source, position and queue alive while the room owns playback.
  useLayoutEffect(() => {
    if (active) return;
    playRequestRef.current += 1;
    playAbortRef.current?.abort();
    preparingTrackIdRef.current = null;
    queuePreloaderRef.current?.update([]);
    setSeekDraft(null);
    onPause();
  }, [active, onPause]);

  const clearCurrentPlayback = useCallback(() => {
    playRequestRef.current += 1;
    playAbortRef.current?.abort();
    preparingTrackIdRef.current = null;
    nextQueueItemIdRef.current = null;
    const audio = audioRef.current;
    audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    mediaEpochRef.current += 1;
    playbackRecordsRef.current = [];
    currentIndexRef.current = 0;
    playbackSequenceKindRef.current = "direct";
    currentRecordRef.current = null;
    setCurrentRecord(null);
    setPlayback(null);
    setProgressMs(0);
    setSeekDraft(null);
    setAudioDurationMs(0);
  }, []);

  const onSeek = useCallback(async (positionMs: number) => {
    if (!activeRef.current) return null;
    const record = currentRecordRef.current;
    const audio = audioRef.current;
    if (!record || !audio) return null;

    const duration = audioDurationMs || record.durationMs;
    const boundedPosition = duration > 0
      ? Math.min(Math.max(0, positionMs), duration)
      : Math.max(0, positionMs);
    audio.currentTime = boundedPosition / 1000;
    setProgressMs(boundedPosition);
    const nextPlayback = createPlaybackSnapshot({
      record,
      status: audio.paused ? "paused" : "playing",
      positionMs: boundedPosition,
      startedAt: audio.paused
        ? null
        : new Date(Date.now() - boundedPosition).toISOString()
    });
    setPlayback(nextPlayback);
    return nextPlayback;
  }, [audioDurationMs, createPlaybackSnapshot]);

  const stopAtEnd = useCallback(() => {
    const record = currentRecordRef.current;
    const audio = audioRef.current;
    if (!record) return;

    const durationMs = audioDurationMs || record.durationMs;
    if (audio && durationMs > 0) {
      audio.currentTime = durationMs / 1000;
      audio.pause();
    }
    setProgressMs(durationMs);
    setPlayback(createPlaybackSnapshot({ record, status: "paused", positionMs: durationMs }));
  }, [audioDurationMs, createPlaybackSnapshot]);

  const findPlayableIndex = useCallback(async (startIndex: number, direction: 1 | -1) => {
    const records = playbackRecordsRef.current;
    if (records.length === 0) return -1;
    if (records.length === 1) {
      const candidate = records[0];
      return candidate && (isTrackPlayable(candidate) || (await loadAudioFile(candidate).catch(() => null))) ? 0 : -1;
    }

    for (let offset = 1; offset <= records.length; offset += 1) {
      const index = ((startIndex + direction * offset) % records.length + records.length) % records.length;
      const candidate = records[index];
      if (candidate && (isTrackPlayable(candidate) || (await loadAudioFile(candidate).catch(() => null)))) {
        return index;
      }
    }
    return -1;
  }, [isTrackPlayable, loadAudioFile]);

  const onPrev = useCallback(() => {
    if (!activeRef.current) return;
    if (progressRef.current > 3000) {
      void onSeek(0);
      return;
    }
    void findPlayableIndex(currentIndexRef.current, -1).then((nextIndex) => {
      if (nextIndex >= 0) {
        void playRecords(
          playbackRecordsRef.current,
          nextIndex,
          playbackSequenceKindRef.current
        );
      }
    });
  }, [findPlayableIndex, onSeek, playRecords]);

  const onNext = useCallback(async () => {
    if (!activeRef.current) return;
    const records = playbackRecordsRef.current;
    const queuedNextId = nextQueueItemIdRef.current;
    if (queuedNextId) {
      nextQueueItemIdRef.current = null;
      const nextIndex = records.findIndex(
        (track) => buildLocalQueueItemId(track.id) === queuedNextId
      );
      const currentId = currentRecordRef.current?.id ?? null;
      if (nextIndex >= 0 && records[nextIndex]?.id !== currentId) {
        if (isTrackPlayable(records[nextIndex]!) || await loadAudioFile(records[nextIndex]!).catch(() => null)) {
          await playRecords(records, nextIndex, playbackSequenceKindRef.current);
          return;
        }
      }
    }

    if (playbackMode === "shuffle") {
      const currentTrackId = records[currentIndexRef.current]?.id ?? currentRecordRef.current?.id ?? null;
      const selection = takeNextShuffleTrack(
        records,
        shuffleBagRef.current,
        currentTrackId,
        isTrackPlayable
      );
      shuffleBagRef.current = selection.bag;
      if (selection.track) {
        const nextIndex = records.findIndex((track) => track.id === selection.track?.id);
        if (nextIndex >= 0) {
          void playRecords(records, nextIndex, playbackSequenceKindRef.current);
          return;
        }
      }
      stopAtEnd();
      return;
    }

    void findPlayableIndex(currentIndexRef.current, 1).then((nextIndex) => {
      if (nextIndex >= 0) {
        void playRecords(
          playbackRecordsRef.current,
          nextIndex,
          playbackSequenceKindRef.current
        );
      } else {
        stopAtEnd();
      }
    });
  }, [findPlayableIndex, isTrackPlayable, loadAudioFile, playbackMode, playRecords, stopAtEnd]);

  const onCyclePlaybackMode = useCallback(() => {
    const nextMode = playbackMode === "sequence" ? "shuffle" : playbackMode === "shuffle" ? "single" : "sequence";
    setPlaybackMode(nextMode);
    updateAppSettings({ playback: { localPlaybackMode: nextMode } });
  }, [playbackMode]);

  const handleAudioEnded = useCallback(() => {
    if (playbackMode === "single" && !nextQueueItemIdRef.current) {
      void playRecords(
        playbackRecordsRef.current,
        currentIndexRef.current,
        playbackSequenceKindRef.current
      );
      return;
    }
    onNext();
  }, [onNext, playbackMode, playRecords]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    roomAudioOutput.applyVolume({
      localAudio: audio,
      volume,
      loudnessGainDb
    });
    const handleEnded = () => handleAudioEnded();
    const handleTimeUpdate = () => {
      if (Number.isFinite(audio.currentTime)) {
        setProgressMs(Math.round(audio.currentTime * 1000));
      }
    };
    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioDurationMs(Math.round(audio.duration * 1000));
      }
    };
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
    };
  }, [currentRecord, handleAudioEnded, loudnessGainDb, volume]);

  useEffect(() => {
    const restoreAudioOutput = () => {
      if (document.hidden || !activeRef.current) return;
      void roomAudioOutput.restoreAfterBackground({
        localAudio: audioRef.current,
        volume,
        loudnessGainDb
      });
    };

    document.addEventListener("visibilitychange", restoreAudioOutput);
    window.addEventListener("pageshow", restoreAudioOutput);
    window.addEventListener("focus", restoreAudioOutput);
    return () => {
      document.removeEventListener("visibilitychange", restoreAudioOutput);
      window.removeEventListener("pageshow", restoreAudioOutput);
      window.removeEventListener("focus", restoreAudioOutput);
    };
  }, [loudnessGainDb, volume]);

  const syncProgressFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.currentTime)) {
      setProgressMs(Math.round(audio.currentTime * 1000));
    }
  }, []);

  const syncDurationFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setAudioDurationMs(Math.round(audio.duration * 1000));
    } else if (currentRecordRef.current?.durationMs) {
      setAudioDurationMs(currentRecordRef.current.durationMs);
    }
  }, []);

  const onPlayQueueItem = useCallback(async (queueItemId: string) => {
    const index = queueRef.current.findIndex((track) => buildLocalQueueItemId(track.id) === queueItemId);
    if (index >= 0) await playRecords(queueRef.current, index, "queue");
  }, [playRecords]);

  const onPlayNextQueueItem = useCallback(async (queueItemId: string) => {
    const index = queueRef.current.findIndex(
      (track) => buildLocalQueueItemId(track.id) === queueItemId
    );
    const currentQueueItemId = currentRecordRef.current
      ? buildLocalQueueItemId(currentRecordRef.current.id)
      : null;
    if (index < 0 || queueItemId === currentQueueItemId) return;

    nextQueueItemIdRef.current = queueItemId;
    setPlayback((current) => current
      ? {
          ...current,
          nextQueueItemId: queueItemId,
          playbackRevision: current.playbackRevision + 1
        }
      : current
    );
  }, []);

  const onRemoveQueueItem = useCallback(async (queueItemId: string) => {
    const index = queueRef.current.findIndex((track) => buildLocalQueueItemId(track.id) === queueItemId);
    if (index < 0) return;
    const removedTrack = queueRef.current[index];
    if (preparingTrackIdRef.current === removedTrack.id) {
      playRequestRef.current += 1;
      playAbortRef.current?.abort();
      preparingTrackIdRef.current = null;
    }
    const nextRecords = queueRef.current.filter((_, itemIndex) => itemIndex !== index);
    if (nextQueueItemIdRef.current === queueItemId) {
      nextQueueItemIdRef.current = null;
      setPlayback((current) => current
        ? {
            ...current,
            nextQueueItemId: null,
            playbackRevision: current.playbackRevision + 1
          }
        : current
      );
    }
    shuffleBagRef.current = shuffleBagRef.current.filter((trackId) => trackId !== removedTrack.id);
    queueRef.current = nextRecords;
    setQueueRecords(nextRecords);
    if (playbackSequenceKindRef.current === "queue") {
      playbackRecordsRef.current = nextRecords;
      if (index < currentIndexRef.current) currentIndexRef.current -= 1;
    } else if (playbackSequenceKindRef.current === "direct" && currentRecordRef.current) {
      playbackRecordsRef.current = [
        currentRecordRef.current,
        ...nextRecords.filter((track) => track.id !== currentRecordRef.current?.id)
      ];
      currentIndexRef.current = 0;
    }
    if (currentRecordRef.current?.id === removedTrack.id) {
      onPause();
    }
    void releaseProviderTrackPlaybackCache(removedTrack.fileHash).catch(() => undefined);
  }, [onPause]);

  useEffect(() => {
    if (!currentRecord) return;
    if (queueRecords.some((track) => track.id === currentRecord.id)) return;
    clearCurrentPlayback();
  }, [clearCurrentPlayback, currentRecord, queueRecords]);

  const onReorderQueue = useCallback(async (queueItemIds: string[]) => {
    const recordsByQueueId = new Map(
      queueRef.current.map((track) => [buildLocalQueueItemId(track.id), track] as const)
    );
    const nextRecords = queueItemIds
      .map((queueItemId) => recordsByQueueId.get(queueItemId))
      .filter((track): track is LocalPlaylistTrackRecord => Boolean(track));
    if (nextRecords.length !== queueRef.current.length) return;
    const currentId = currentRecordRef.current?.id;
    queueRef.current = nextRecords;
    setQueueRecords(nextRecords);
    if (playbackSequenceKindRef.current === "queue") {
      playbackRecordsRef.current = nextRecords;
      currentIndexRef.current = Math.max(0, nextRecords.findIndex((track) => track.id === currentId));
    } else if (playbackSequenceKindRef.current === "direct" && currentRecordRef.current) {
      playbackRecordsRef.current = [
        currentRecordRef.current,
        ...nextRecords.filter((track) => track.id !== currentRecordRef.current?.id)
      ];
      currentIndexRef.current = 0;
    }
  }, []);

  const currentTrack = useMemo(
    () => currentRecord ? toTrackMeta(currentRecord) : null,
    [currentRecord]
  );
  const tracks = useMemo(() => {
    const records = [...libraryRecords, ...queueRecords].filter((track, index, list) =>
      list.findIndex((candidate) => candidate.id === track.id) === index
    );
    return records.map(toTrackMeta);
  }, [libraryRecords, queueRecords]);
  const queue = useMemo(
    () => queueRecords.map((track, position) => ({
      id: buildLocalQueueItemId(track.id),
      trackId: track.id,
      requestedBy: "本地歌单",
      requestedById: localQueueOwnerId,
      source: "manual" as const,
      sourceSeedTrackId: null,
      position,
      createdAt: track.createdAt
    })),
    [queueRecords]
  );

  const value = useMemo<LocalPlayerContextValue>(() => ({
    audioRef,
    playback,
    currentTrack,
    seekDraft,
    setSeekDraft,
    audioDurationMs,
    volume,
    setVolume,
    syncProgressFromAudio,
    syncDurationFromAudio,
    tracks,
    queue,
    currentQueueItemId: currentRecord && queueRecords.some((track) => track.id === currentRecord.id)
      ? buildLocalQueueItemId(currentRecord.id)
      : null,
    canControlPlayback: active && Boolean(currentRecord || queueRecords.length > 0 || libraryRecords.length > 0),
    canSeekPlayback: active && Boolean(currentRecord),
    playbackMode,
    isTrackPlayable,
    addToQueue,
    playTrack,
    playTracks,
    onPlay,
    onPause,
    onSeek,
    onPrev,
    onNext,
    onCyclePlaybackMode,
    onPlayQueueItem,
    onPlayNextQueueItem,
    onRemoveQueueItem,
    onReorderQueue
  }), [
    active,
    audioDurationMs,
    currentRecord,
    currentTrack,
    addToQueue,
    isTrackPlayable,
    onCyclePlaybackMode,
    onNext,
    onPause,
    onPlay,
    onPlayQueueItem,
    onPlayNextQueueItem,
    onPrev,
    onRemoveQueueItem,
    onReorderQueue,
    onSeek,
    playTrack,
    playTracks,
    playback,
    playbackMode,
    queue,
    seekDraft,
    syncDurationFromAudio,
    syncProgressFromAudio,
    tracks,
    volume,
    queueRecords,
    libraryRecords
  ]);

  return (
    <LocalPlayerContext.Provider value={value}>
      <LocalPlayerProgressContext.Provider value={progressMs}>
        <audio
          ref={audioRef}
          className="hidden"
          data-testid="personal-audio"
          playsInline
          crossOrigin="anonymous"
          onLoadedMetadata={() => {
            syncDurationFromAudio();
            syncProgressFromAudio();
          }}
          onDurationChange={syncDurationFromAudio}
          onPlay={() => {
            if (!activeRef.current) audioRef.current?.pause();
            syncProgressFromAudio();
          }}
          onPause={syncProgressFromAudio}
          onSeeked={syncProgressFromAudio}
        />
        {children}
      </LocalPlayerProgressContext.Provider>
    </LocalPlayerContext.Provider>
  );
}

export function useLocalPlayer() {
  const context = useContext(LocalPlayerContext);
  if (!context) {
    throw new Error("useLocalPlayer must be used within LocalPlayerProvider");
  }
  return context;
}

export function usePlayerProgressMs() {
  return useContext(LocalPlayerProgressContext);
}

