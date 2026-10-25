import { useCallback, type Dispatch, type SetStateAction } from "react";
import { soqaroApi } from "@/lib/network/soqaro-api";
import {
  ensureDefaultLocalPlaylist,
  getDefaultLocalPlaylistTrackIds,
  localPlaylistTrackId,
  listMergedLocalPlaylistTracks,
  restoreLocalPlaylistsFromRepository,
  type LocalPlaylistTrackRecord
} from "@/features/playlist/local-playlist";
import { getLocalAudioStorageState } from "@/features/library/local-audio-storage";
import {
  buildPlaybackStatusMessage,
  prepareTrackForImmediatePlayback,
  toPlaybackPreparationErrorMessage
} from "@/features/playback/provider-playback-preparation";
import { downloadProviderTrackToLibrary } from "@/features/playback/provider-track-download";
import { toProviderErrorMessage, type Track } from "./search-ui-primitives";
import type { useLocalPlayer } from "@/features/playback/local-player-context";

export async function resolveTrackArtwork(track: Track): Promise<Track> {
  if (track.artworkUrl) return track;
  try {
    if (track.provider === "netease") {
      return await soqaroApi.getNeteaseTrack(track.providerTrackId);
    }
    if (track.provider === "qqmusic") {
      return await soqaroApi.getQqMusicTrack(track.providerTrackId);
    }
    if (track.provider === "bilibili") {
      const bvid = track.bvid ?? track.providerTrackId.split(":")[0]!;
      const detail = await soqaroApi.getBilibiliView(bvid);
      return {
        ...track,
        artworkUrl: detail.pic
      };
    }
    return track;
  } catch {
    return track;
  }
}

type ProviderTrackActionsOptions = {
  localTracks: LocalPlaylistTrackRecord[];
  setLocalTracks: Dispatch<SetStateAction<LocalPlaylistTrackRecord[]>>;
  playbackTracks: LocalPlaylistTrackRecord[];
  setPlaybackTracks: Dispatch<SetStateAction<LocalPlaylistTrackRecord[]>>;
  player: ReturnType<typeof useLocalPlayer>;
  pending: string | null;
  setPending: (value: string | null) => void;
  setErrorMessage: (message: string | null) => void;
  setStatusMessage: (message: string | null) => void;
};

export function useProviderTrackActions({
  localTracks,
  setLocalTracks,
  playbackTracks,
  setPlaybackTracks,
  player,
  pending,
  setPending,
  setErrorMessage,
  setStatusMessage
}: ProviderTrackActionsOptions) {
  const cacheTrackForPlayback = useCallback(async (track: Track) => {
    const trackId = localPlaylistTrackId(track);
    const savedTrack = localTracks.find((item) => item.id === trackId);
    if (savedTrack?.fileHash && player.isTrackPlayable(savedTrack)) return savedTrack;
    const cachedTrack = playbackTracks.find((item) => item.id === trackId);
    if (cachedTrack?.fileHash && player.isTrackPlayable(cachedTrack)) return cachedTrack;

    // Unified preparation: resolves saved-library/playback-cache sources and
    // downloads to the playback cache only when neither is available.
    const prepared = await prepareTrackForImmediatePlayback(track);
    setPlaybackTracks((current) => [...current.filter((item) => item.id !== prepared.record.id), prepared.record]);
    return prepared.record;
  }, [localTracks, playbackTracks, player, setPlaybackTracks]);

  const playProviderTrack = useCallback(async (track: Track) => {
    if (pending) return;
    setPending(`play:${track.provider}:${track.providerTrackId}`);
    setErrorMessage(null);
    try {
      const prepared = await prepareTrackForImmediatePlayback(track);
      setPlaybackTracks((current) => [...current.filter((item) => item.id !== prepared.record.id), prepared.record]);
      await player.playTrack(prepared.record);
      setStatusMessage(buildPlaybackStatusMessage(track.title, prepared.source));
    } catch (error) {
      setErrorMessage(toPlaybackPreparationErrorMessage(error, `《${track.title}》播放失败，请稍后重试。`));
    } finally {
      setPending(null);
    }
  }, [pending, player, setErrorMessage, setPending, setPlaybackTracks, setStatusMessage]);

  const queueProviderTrack = useCallback(async (track: Track) => {
    if (pending) return;
    setPending(`queue:${track.provider}:${track.providerTrackId}`);
    setErrorMessage(null);
    try {
      const prepared = await prepareTrackForImmediatePlayback(track);
      setPlaybackTracks((current) => [...current.filter((item) => item.id !== prepared.record.id), prepared.record]);
      player.addToQueue(prepared.record);
      setStatusMessage(`《${track.title}》已加入播放队列。`);
    } catch (error) {
      setErrorMessage(toPlaybackPreparationErrorMessage(error, `《${track.title}》加入队列失败，请稍后重试。`));
    } finally {
      setPending(null);
    }
  }, [pending, player, setErrorMessage, setPending, setPlaybackTracks, setStatusMessage]);

  const downloadTrack = useCallback(async (track: Track) => {
    const downloadKey = `download:${track.provider}:${track.providerTrackId}`;
    if (
      pending ||
      localTracks.some(
        (item) =>
          item.provider === track.provider &&
          item.providerTrackId === track.providerTrackId &&
          item.availableOffline
      )
    ) {
      return;
    }

    setPending(downloadKey);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const existing = localTracks.find((item) => item.id === localPlaylistTrackId(track));
      const updatedTrack = await downloadProviderTrackToLibrary({
        track,
        existing,
        onResolved: (resolved) => {
          setLocalTracks([...localTracks.filter((item) => item.id !== resolved.id), resolved]);
        }
      });
      setLocalTracks([...localTracks.filter((item) => item.id !== updatedTrack.id), updatedTrack]);

      const storage = await getLocalAudioStorageState();
      const savedFileHashes = new Set(storage.savedFileHashes);
      const mergedTracks = await listMergedLocalPlaylistTracks();
      await restoreLocalPlaylistsFromRepository();
      ensureDefaultLocalPlaylist({
        trackIds: getDefaultLocalPlaylistTrackIds(mergedTracks, savedFileHashes),
        sourceDirectoryName: storage.directoryName
      });
      setStatusMessage(`《${updatedTrack.title}》已下载并保存到本地歌单。`);
    } catch (error) {
      setErrorMessage(toProviderErrorMessage(error, track.provider));
    } finally {
      setPending(null);
    }
  }, [
    localTracks,
    pending,
    setErrorMessage,
    setLocalTracks,
    setPending,
    setStatusMessage
  ]);

  return {
    cacheTrackForPlayback,
    playProviderTrack,
    queueProviderTrack,
    downloadTrack
  };
}
