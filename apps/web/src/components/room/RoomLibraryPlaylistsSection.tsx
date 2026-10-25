/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BilibiliTrackCandidate,
  NeteaseTrackCandidate,
  Playlist,
  ProviderTrackCandidate,
  QqMusicTrackCandidate,
  TrackMeta
} from "@soqaro/shared";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/domain/soqaro-ui";
import { soqaroApi } from "@/lib/network/soqaro-api";
import type { CachedLibraryTrack } from "@/features/library/audio-utils";
import { getArtworkSourceUrl } from "@/components/bottom-player/artwork-colors";
import {
  CheckIcon,
  FolderIcon,
  ListMusicIcon,
  TrashIcon
} from "@/components/icons/DiscoverIcons";
import { importTaskStore, useVisibleImportTasks, isCandidateImporting } from "@/features/upload/import-task-store";
import { listLocalPlaylistTracks, type LocalPlaylistTrackRecord } from "@/features/library/indexeddb";
import { toCachedProviderTrack } from "@/features/playlist/local-playlist-mappers";

type ProviderTrack = ProviderTrackCandidate;

export type RoomLibraryPlaylistsSectionProps = {
  roomPlaylists: Playlist[];
  tracks: TrackMeta[];
  canManageLibrary: boolean;
  canAddToQueue: boolean;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onLoadPlaylistIntoRoom: (playlistId: string) => Promise<void>;
  onImportNeteaseTrack?: (track: NeteaseTrackCandidate) => Promise<void>;
  onImportQqMusicTrack?: (track: QqMusicTrackCandidate) => Promise<void>;
  onImportBilibiliTrack?: (track: BilibiliTrackCandidate) => Promise<void>;
  onImportNeteaseTracks?: (tracks: NeteaseTrackCandidate[]) => Promise<void>;
  onImportQqMusicTracks?: (tracks: QqMusicTrackCandidate[]) => Promise<void>;
  onImportBilibiliTracks?: (tracks: BilibiliTrackCandidate[]) => Promise<void>;
  onImportCachedTrack?: (track: CachedLibraryTrack) => Promise<void>;
  onSwitchToDesk?: () => void;
};

type PlaylistTrackItem = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  artworkUrl: string | null;
  providerTrack: ProviderTrack | null;
  isInRoom: boolean;
};

type RoomPlaylistSource =
  | { type: "playlist"; provider: "netease" | "qqmusic"; playlistId: string }
  | { type: "album"; provider: "netease" | "qqmusic"; albumId: string }
  | { type: "bilibili"; bvid: string };

function getRoomPlaylistSource(playlist: Playlist): RoomPlaylistSource | null {
  const albumTag = playlist.tags?.find((tag) => tag.startsWith("album:"));
  if (albumTag) {
    const parts = albumTag.split(":");
    if (parts.length >= 3) {
      const provider = parts[1];
      const id = parts.slice(2).join(":");
      if (provider === "bilibili") return { type: "bilibili", bvid: id };
      if (provider === "netease" || provider === "qqmusic") return { type: "album", provider, albumId: id };
    }
  }

  const networkTag = playlist.tags?.find((tag) => tag.startsWith("network:"));
  if (networkTag) {
    const [, provider, ...idParts] = networkTag.split(":");
    const id = idParts.join(":");
    if (provider === "bilibili") return { type: "bilibili", bvid: id };
    if (provider === "netease" || provider === "qqmusic") return { type: "playlist", provider, playlistId: id };
  }

  const directTag = playlist.tags?.find((tag) =>
    tag.startsWith("netease:") || tag.startsWith("qqmusic:") || tag.startsWith("bilibili:")
  );
  if (directTag) {
    const [provider, ...idParts] = directTag.split(":");
    const id = idParts.join(":");
    if (provider === "bilibili") return { type: "bilibili", bvid: id };
    if (provider === "netease" || provider === "qqmusic") return { type: "playlist", provider, playlistId: id };
  }

  return null;
}

async function fetchSourceTracks(source: RoomPlaylistSource): Promise<ProviderTrack[]> {
  try {
    if (source.type === "bilibili") {
      const detail = await soqaroApi.getBilibiliVideoParts(source.bvid);
      return detail.parts;
    }
    if (source.type === "album") {
      const detail = source.provider === "netease"
        ? await soqaroApi.getNeteaseAlbum(source.albumId)
        : await soqaroApi.getQqMusicAlbum(source.albumId);
      return detail.tracks;
    }
    const detail = source.provider === "netease"
      ? await soqaroApi.getNeteasePlaylist(source.playlistId)
      : source.provider === "qqmusic"
        ? await soqaroApi.getQqMusicPlaylist(source.playlistId)
        : null;
    return detail?.tracks ?? [];
  } catch {
    return [];
  }
}

export function RoomLibraryPlaylistsSection({
  roomPlaylists,
  tracks,
  canManageLibrary,
  canAddToQueue,
  onDeletePlaylist,
  onLoadPlaylistIntoRoom,
  onImportNeteaseTrack,
  onImportQqMusicTrack,
  onImportBilibiliTrack,
  onImportNeteaseTracks,
  onImportQqMusicTracks,
  onImportBilibiliTracks,
  onImportCachedTrack,
  onSwitchToDesk
}: RoomLibraryPlaylistsSectionProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isQueueBusyId, setIsQueueBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useVisibleImportTasks();

  const selectedPlaylist = useMemo(
    () => roomPlaylists.find((p) => p.id === selectedPlaylistId) ?? null,
    [roomPlaylists, selectedPlaylistId]
  );

  const roomTrackKeySet = useMemo(() => {
    return new Set(
      tracks.flatMap((t) => {
        const keys = [t.id];
        if (t.sourceRef) {
          keys.push(`${t.sourceRef.provider}:${t.sourceRef.trackId}`);
          keys.push(`provider:${t.sourceRef.provider}:${t.sourceRef.trackId}`);
          keys.push(t.sourceRef.trackId);
        }
        if (t.fileHash) keys.push(t.fileHash);
        return keys;
      })
    );
  }, [tracks]);

  const playlistStats = useMemo(() => {
    const map = new Map<string, { total: number; imported: number; isAllImported: boolean }>();
    for (const playlist of roomPlaylists) {
      const total = playlist.trackIds.length;
      const imported = playlist.trackIds.filter((id) => {
        if (roomTrackKeySet.has(id)) return true;
        const normalized = id.startsWith("provider:") ? id.slice("provider:".length) : id;
        if (roomTrackKeySet.has(normalized)) return true;
        return false;
      }).length;
      map.set(playlist.id, { total, imported, isAllImported: total > 0 && imported >= total });
    }
    return map;
  }, [roomPlaylists, roomTrackKeySet]);

  const handleAddAllToQueue = useCallback(
    async (playlist: Playlist) => {
      if (!canAddToQueue || isQueueBusyId !== null) return;
      setIsQueueBusyId(playlist.id);
      setStatusMessage(`正在准备将歌单《${playlist.title}》的全部歌曲加入节目单…`);
      try {
        const source = getRoomPlaylistSource(playlist);
        let remoteTracks: ProviderTrack[] = [];
        if (source) {
          remoteTracks = await fetchSourceTracks(source);
        }

        if (remoteTracks.length === 0) {
          const localTracks = await listLocalPlaylistTracks().catch(() => []);
          const localMap = new Map<string, LocalPlaylistTrackRecord>();
          for (const r of localTracks) {
            localMap.set(r.id, r);
            if (r.providerTrackId) {
              localMap.set(`${r.provider}:${r.providerTrackId}`, r);
              localMap.set(`provider:${r.provider}:${r.providerTrackId}`, r);
              localMap.set(r.providerTrackId, r);
            }
          }
          for (const rawId of playlist.trackIds) {
            const foundRecord = localMap.get(rawId) || localMap.get(rawId.replace(/^provider:/, ""));
            if (foundRecord) {
              const candidate = toCachedProviderTrack(foundRecord);
              if (candidate) remoteTracks.push(candidate);
              continue;
            }
            const cleanId = rawId.startsWith("provider:") ? rawId.slice("provider:".length) : rawId;
            const parts = cleanId.split(":");
            if (parts.length >= 2 && (parts[0] === "netease" || parts[0] === "qqmusic" || parts[0] === "bilibili")) {
              const provider = parts[0] as "netease" | "qqmusic" | "bilibili";
              const trackId = parts.slice(1).join(":");
              remoteTracks.push({
                provider,
                providerTrackId: trackId,
                access: "unknown",
                quality: null,
                bvid: provider === "bilibili" ? trackId.split(":")[0] : undefined,
                title: provider === "bilibili" ? `B站音频 ${trackId}` : `网络歌曲 ${trackId}`,
                artist: provider === "bilibili" ? "哔哩哔哩" : "网络音乐",
                album: null,
                durationMs: 0,
                artworkUrl: null
              });
            } else if (/^BV[a-zA-Z0-9]+/.test(cleanId)) {
              remoteTracks.push({
                provider: "bilibili",
                providerTrackId: cleanId,
                access: "unknown",
                quality: null,
                bvid: cleanId.split(":")[0],
                title: `B站音频 ${cleanId}`,
                artist: "哔哩哔哩",
                album: null,
                durationMs: 0,
                artworkUrl: null
              });
            }
          }
        }

        const missingNetease: NeteaseTrackCandidate[] = [];
        const missingQqMusic: QqMusicTrackCandidate[] = [];
        const missingBilibili: BilibiliTrackCandidate[] = [];

        for (const track of remoteTracks) {
          const inRoom = tracks.some(
            (t) =>
              (t.sourceRef?.provider === track.provider && t.sourceRef?.trackId === track.providerTrackId) ||
              (t.id === track.providerTrackId) ||
              (t.id === `${track.provider}:${track.providerTrackId}`)
          );
          if (!inRoom) {
            if (track.provider === "netease") missingNetease.push(track as NeteaseTrackCandidate);
            else if (track.provider === "qqmusic") missingQqMusic.push(track as QqMusicTrackCandidate);
            else if (track.provider === "bilibili") missingBilibili.push(track as BilibiliTrackCandidate);
          }
        }

        const totalMissing = missingNetease.length + missingQqMusic.length + missingBilibili.length;
        if (totalMissing > 0) {
          setStatusMessage(`正在导入剩余的 ${totalMissing} 首歌曲到曲库…`);
          if (missingNetease.length > 0 && onImportNeteaseTracks) {
            await onImportNeteaseTracks(missingNetease);
          }
          if (missingQqMusic.length > 0 && onImportQqMusicTracks) {
            await onImportQqMusicTracks(missingQqMusic);
          }
          if (missingBilibili.length > 0 && onImportBilibiliTracks) {
            await onImportBilibiliTracks(missingBilibili);
          }
        }

        await onLoadPlaylistIntoRoom(playlist.id);
        setStatusMessage(`已将歌单《${playlist.title}》全部歌曲加入节目单。`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "加入节目单失败。");
      } finally {
        setIsQueueBusyId(null);
      }
    },
    [canAddToQueue, isQueueBusyId, onLoadPlaylistIntoRoom, onImportNeteaseTracks, onImportQqMusicTracks, onImportBilibiliTracks, tracks]
  );

  const handleDeletePlaylist = useCallback(
    async (playlistId: string) => {
      if (!canManageLibrary || pendingDeleteId !== null) return;
      setPendingDeleteId(playlistId);
      try {
        await onDeletePlaylist(playlistId);
        if (selectedPlaylistId === playlistId) {
          setSelectedPlaylistId(null);
        }
        setStatusMessage("歌单已从曲库中移除。");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "移除歌单失败。");
      } finally {
        setPendingDeleteId(null);
      }
    },
    [canManageLibrary, onDeletePlaylist, pendingDeleteId, selectedPlaylistId]
  );

  if (selectedPlaylist) {
    return (
      <RoomLibraryPlaylistDetail
        canAddToQueue={canAddToQueue}
        canManageLibrary={canManageLibrary}
        isQueueBusy={isQueueBusyId === selectedPlaylist.id}
        onAddAllToQueue={() => void handleAddAllToQueue(selectedPlaylist)}
        onBack={() => setSelectedPlaylistId(null)}
        onDelete={() => void handleDeletePlaylist(selectedPlaylist.id)}
        onImportCachedTrack={onImportCachedTrack}
        onImportNeteaseTrack={onImportNeteaseTrack}
        onImportNeteaseTracks={onImportNeteaseTracks}
        onImportQqMusicTrack={onImportQqMusicTrack}
        onImportQqMusicTracks={onImportQqMusicTracks}
        onImportBilibiliTrack={onImportBilibiliTrack}
        onImportBilibiliTracks={onImportBilibiliTracks}
        playlist={selectedPlaylist}
        roomTracks={tracks}
      />
    );
  }

  return (
    <section className="flex w-full flex-col gap-3" data-testid="room-library-playlists-section">
      {statusMessage ? (
        <div className="flex items-center justify-end">
          <p className="truncate text-xs text-accent" role="status">
            {statusMessage}
          </p>
        </div>
      ) : null}

      {roomPlaylists.length > 0 ? (
        <div className="divide-y divide-surface-border/50 overflow-hidden rounded-xl border border-surface-border/60 bg-surface/40">
          {roomPlaylists.map((playlist) => {
            const stats = playlistStats.get(playlist.id) ?? {
              total: playlist.trackIds.length,
              imported: 0,
              isAllImported: false
            };
            const source = getRoomPlaylistSource(playlist);
            const sourceLabel = source?.type === "bilibili"
              ? "哔哩哔哩"
              : source?.provider === "netease"
              ? (source.type === "album" ? "网易云专辑" : "网易云音乐")
              : source?.provider === "qqmusic"
              ? (source.type === "album" ? "QQ音乐专辑" : "QQ 音乐")
              : "曲库歌单";
            const isBusy =
              isQueueBusyId === playlist.id ||
              importTaskStore.isItemImporting(playlist.id) ||
              importTaskStore.isItemImporting(playlist.title);
            const isDeleting = pendingDeleteId === playlist.id;

            return (
              <article
                key={playlist.id}
                className="group flex min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover/70"
              >
                <button
                  aria-label={`打开曲库歌单 ${playlist.title}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  type="button"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-surface-border/60 bg-surface shadow-xs">
                    {playlist.coverUrl ? (
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        src={getArtworkSourceUrl(playlist.coverUrl)}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-foreground-muted">
                        <FolderIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <strong className="block truncate text-xs sm:text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                      {playlist.title}
                    </strong>
                    <div className="flex items-center gap-2 text-xs text-foreground-muted">
                      <span>{sourceLabel}</span>
                      <span className="text-surface-border">/</span>
                      <span>共 {stats.total} 首</span>
                      <span className="text-surface-border">/</span>
                      <span className={stats.isAllImported ? "text-emerald-400 font-medium" : "text-foreground-muted"}>
                        已导入 {stats.imported} 首
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    className="flex h-7.5 items-center gap-1 rounded-md px-2 text-xs font-medium border border-surface-border bg-surface hover:bg-surface-hover text-foreground active:scale-95 disabled:cursor-wait"
                    disabled={isBusy}
                    onClick={() => void handleAddAllToQueue(playlist)}
                    size="sm"
                    title="将歌单全部歌曲加入节目单"
                    type="button"
                    variant="outline"
                  >
                    <ListMusicIcon className="h-3.5 w-3.5" />
                    <span>{isBusy ? "加入中…" : "全部加队列"}</span>
                  </Button>
                  {canManageLibrary ? (
                    <Button
                      aria-label={`从曲库移除歌单 ${playlist.title}`}
                      className="h-7.5 w-7.5 shrink-0 text-foreground-muted transition-colors hover:bg-red-500/15 hover:text-red-400"
                      disabled={isDeleting}
                      onClick={() => void handleDeletePlaylist(playlist.id)}
                      size="icon"
                      title="从曲库移除歌单"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-border/60 bg-surface/20 px-4 py-8 text-center">
          <FolderIcon className="mx-auto h-8 w-8 text-foreground-muted/60" />
          <p className="mt-2 text-xs sm:text-sm font-semibold text-foreground">曲库暂无歌单</p>
          <p className="mt-1 text-xs text-foreground-muted">
            可以在“搜歌添加 -&gt; 我的歌单”中将歌单加入曲库。
          </p>
          {onSwitchToDesk ? (
            <Button
              className="mt-3.5 h-7.5 rounded-lg px-3 text-xs font-semibold bg-accent text-white shadow-xs hover:bg-accent-hover"
              onClick={onSwitchToDesk}
              size="sm"
              type="button"
            >
              前往选择歌单
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RoomLibraryPlaylistDetail({
  playlist,
  roomTracks,
  canManageLibrary,
  canAddToQueue,
  isQueueBusy,
  onBack,
  onAddAllToQueue,
  onDelete,
  onImportNeteaseTrack,
  onImportQqMusicTrack,
  onImportBilibiliTrack,
  onImportNeteaseTracks,
  onImportQqMusicTracks,
  onImportBilibiliTracks,
  onImportCachedTrack: _onImportCachedTrack
}: {
  playlist: Playlist;
  roomTracks: TrackMeta[];
  canManageLibrary: boolean;
  canAddToQueue: boolean;
  isQueueBusy: boolean;
  onBack: () => void;
  onAddAllToQueue: () => void;
  onDelete: () => void;
  onImportNeteaseTrack?: (track: NeteaseTrackCandidate) => Promise<void>;
  onImportQqMusicTrack?: (track: QqMusicTrackCandidate) => Promise<void>;
  onImportBilibiliTrack?: (track: BilibiliTrackCandidate) => Promise<void>;
  onImportNeteaseTracks?: (tracks: NeteaseTrackCandidate[]) => Promise<void>;
  onImportQqMusicTracks?: (tracks: QqMusicTrackCandidate[]) => Promise<void>;
  onImportBilibiliTracks?: (tracks: BilibiliTrackCandidate[]) => Promise<void>;
  onImportCachedTrack?: (track: CachedLibraryTrack) => Promise<void>;
}) {
  useVisibleImportTasks();
  const [remoteTracks, setRemoteTracks] = useState<ProviderTrack[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [pendingTrackIds, setPendingTrackIds] = useState<Set<string>>(() => new Set());
  const [isImportingSelected, setIsImportingSelected] = useState(false);
  const [detailStatus, setDetailStatus] = useState<string | null>(null);
  const pendingTrackIdsRef = useRef<Set<string>>(new Set());

  const isQueueBusyComputed =
    isQueueBusy ||
    importTaskStore.isItemImporting(playlist.id) ||
    importTaskStore.isItemImporting(playlist.title);

  const source = useMemo(() => getRoomPlaylistSource(playlist), [playlist]);

  useEffect(() => {
    let cancelled = false;
    async function loadTracks() {
      setRemoteLoading(true);
      let tracks: ProviderTrack[] = [];
      if (source) {
        try {
          tracks = await fetchSourceTracks(source);
        } catch {
          tracks = [];
        }
      }

      if (tracks.length === 0) {
        const localTracks = await listLocalPlaylistTracks().catch(() => []);
        const localMap = new Map<string, LocalPlaylistTrackRecord>();
        for (const r of localTracks) {
          localMap.set(r.id, r);
          if (r.providerTrackId) {
            localMap.set(`${r.provider}:${r.providerTrackId}`, r);
            localMap.set(`provider:${r.provider}:${r.providerTrackId}`, r);
            localMap.set(r.providerTrackId, r);
          }
        }
        for (const rawId of playlist.trackIds) {
          const found = localMap.get(rawId) || localMap.get(rawId.replace(/^provider:/, ""));
          if (found) {
            const candidate = toCachedProviderTrack(found);
            if (candidate) {
              tracks.push(candidate);
              continue;
            }
          }
          const cleanId = rawId.startsWith("provider:") ? rawId.slice("provider:".length) : rawId;
          const parts = cleanId.split(":");
          if (parts.length >= 2 && (parts[0] === "netease" || parts[0] === "qqmusic" || parts[0] === "bilibili")) {
            const provider = parts[0] as "netease" | "qqmusic" | "bilibili";
            const trackId = parts.slice(1).join(":");
            tracks.push({
              provider,
              providerTrackId: trackId,
              access: "unknown",
              quality: null,
              bvid: provider === "bilibili" ? trackId.split(":")[0] : undefined,
              title: provider === "bilibili" ? `B站音频 ${trackId}` : `网络歌曲 ${trackId}`,
              artist: provider === "bilibili" ? "哔哩哔哩" : "网络音乐",
              album: null,
              durationMs: 0,
              artworkUrl: null
            });
          } else if (/^BV[a-zA-Z0-9]+/.test(cleanId)) {
            tracks.push({
              provider: "bilibili",
              providerTrackId: cleanId,
              access: "unknown",
              quality: null,
              bvid: cleanId.split(":")[0],
              title: `B站音频 ${cleanId}`,
              artist: "哔哩哔哩",
              album: null,
              durationMs: 0,
              artworkUrl: null
            });
          }
        }
      }

      if (!cancelled) {
        setRemoteTracks(tracks);
        setRemoteLoading(false);
      }
    }

    void loadTracks();
    return () => {
      cancelled = true;
    };
  }, [playlist.trackIds, source]);

  const roomProviderTrackKeys = useMemo(() => {
    return new Set(
      roomTracks.flatMap((track) => {
        const keys = [track.id];
        if (track.fileHash) keys.push(track.fileHash);
        const s = track.sourceRef;
        if (s) {
          keys.push(`${s.provider}:${s.trackId}`);
          keys.push(`provider:${s.provider}:${s.trackId}`);
          keys.push(s.trackId);
        }
        return keys;
      })
    );
  }, [roomTracks]);

  const displayTracks: PlaylistTrackItem[] = useMemo(() => {
    if (remoteTracks.length > 0) {
      return remoteTracks.map((t) => {
        const key = `${t.provider}:${t.providerTrackId}`;
        const inRoom =
          roomProviderTrackKeys.has(key) ||
          roomProviderTrackKeys.has(`provider:${key}`) ||
          roomProviderTrackKeys.has(t.providerTrackId);
        return {
          id: key,
          title: t.title,
          artist: t.artist,
          album: t.album ?? null,
          durationMs: t.durationMs,
          artworkUrl: t.artworkUrl ?? null,
          providerTrack: t,
          isInRoom: inRoom
        };
      });
    }

    return playlist.trackIds.map((trackId, index) => {
      const roomMatch = roomTracks.find(
        (t) =>
          t.id === trackId ||
          (t.sourceRef && `${t.sourceRef.provider}:${t.sourceRef.trackId}` === trackId) ||
          (t.sourceRef && `provider:${t.sourceRef.provider}:${t.sourceRef.trackId}` === trackId) ||
          (t.fileHash && t.fileHash === trackId)
      );
      return {
        id: trackId,
        title: roomMatch?.title ?? `曲目 ${index + 1}`,
        artist: roomMatch?.artist ?? "未知艺术家",
        album: roomMatch?.album ?? null,
        durationMs: roomMatch?.durationMs ?? 0,
        artworkUrl: roomMatch?.artworkUrl ?? null,
        providerTrack: null,
        isInRoom: Boolean(roomMatch)
      };
    });
  }, [playlist.trackIds, remoteTracks, roomProviderTrackKeys, roomTracks]);

  const selectableTracks = useMemo(
    () => displayTracks.filter((t) => !t.isInRoom && t.providerTrack),
    [displayTracks]
  );
  const selectableKeys = useMemo(() => selectableTracks.map((t) => t.id), [selectableTracks]);
  const allSelectableSelected = selectableKeys.length > 0 && selectedKeys.length >= selectableKeys.length;
  const importedCount = displayTracks.filter((t) => t.isInRoom).length;

  const isTrackItemImporting = useCallback(
    (item: PlaylistTrackItem) => {
      if (pendingTrackIds.has(item.id)) return true;
      if (item.providerTrack && isCandidateImporting(item.providerTrack)) return true;
      return importTaskStore.isItemImporting(item.id);
    },
    [pendingTrackIds]
  );

  const isImportBusy =
    isImportingSelected ||
    selectableTracks.some((t) => (t.providerTrack ? isCandidateImporting(t.providerTrack) : importTaskStore.isItemImporting(t.id)));

  const toggleSelectAll = () => {
    setSelectedKeys(allSelectableSelected ? [] : selectableKeys);
  };

  const toggleTrackSelect = (key: string) => {
    setSelectedKeys((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    );
  };

  const importSingleTrack = useCallback(
    async (item: PlaylistTrackItem) => {
      if (!canManageLibrary || !item.providerTrack || item.isInRoom || pendingTrackIdsRef.current.has(item.id)) return;
      pendingTrackIdsRef.current.add(item.id);
      setPendingTrackIds((c) => new Set(c).add(item.id));
      setDetailStatus(`正在导入《${item.title}》…`);
      try {
        if (item.providerTrack.provider === "netease" && onImportNeteaseTrack) {
          await onImportNeteaseTrack(item.providerTrack as NeteaseTrackCandidate);
        } else if (item.providerTrack.provider === "qqmusic" && onImportQqMusicTrack) {
          await onImportQqMusicTrack(item.providerTrack as QqMusicTrackCandidate);
        } else if (item.providerTrack.provider === "bilibili" && onImportBilibiliTrack) {
          await onImportBilibiliTrack(item.providerTrack as BilibiliTrackCandidate);
        }
        setSelectedKeys((c) => c.filter((k) => k !== item.id));
        setDetailStatus(`《${item.title}》导入完成。`);
      } catch (error) {
        setDetailStatus(error instanceof Error ? error.message : `导入《${item.title}》失败。`);
      } finally {
        pendingTrackIdsRef.current.delete(item.id);
        setPendingTrackIds((c) => {
          const next = new Set(c);
          next.delete(item.id);
          return next;
        });
      }
    },
    [canManageLibrary, onImportBilibiliTrack, onImportNeteaseTrack, onImportQqMusicTrack]
  );

  const importSelectedTracks = async () => {
    if (!canManageLibrary || isImportingSelected || selectedKeys.length === 0) return;
    setIsImportingSelected(true);
    const selectedItems = displayTracks.filter((t) => selectedKeys.includes(t.id) && !t.isInRoom && t.providerTrack);
    const netease = selectedItems
      .filter((t) => t.providerTrack?.provider === "netease")
      .map((t) => t.providerTrack) as NeteaseTrackCandidate[];
    const qqmusic = selectedItems
      .filter((t) => t.providerTrack?.provider === "qqmusic")
      .map((t) => t.providerTrack) as QqMusicTrackCandidate[];
    const bilibili = selectedItems
      .filter((t) => t.providerTrack?.provider === "bilibili")
      .map((t) => t.providerTrack) as BilibiliTrackCandidate[];

    setDetailStatus(`正在批量导入 ${selectedItems.length} 首歌曲…`);
    try {
      if (netease.length > 0 && onImportNeteaseTracks) {
        await onImportNeteaseTracks(netease);
      }
      if (qqmusic.length > 0 && onImportQqMusicTracks) {
        await onImportQqMusicTracks(qqmusic);
      }
      if (bilibili.length > 0 && onImportBilibiliTracks) {
        await onImportBilibiliTracks(bilibili);
      }
      setSelectedKeys([]);
      setDetailStatus("批量导入完成。");
    } catch (error) {
      setDetailStatus(error instanceof Error ? error.message : "批量导入失败。");
    } finally {
      setIsImportingSelected(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3" data-testid="room-library-playlist-detail">
      {detailStatus ? (
        <div className="flex items-center justify-end">
          <p className="truncate text-xs text-accent" role="status">
            {detailStatus}
          </p>
        </div>
      ) : null}

      {/* Top Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border/50 pb-2.5">
        <Button
          className="gap-1.5 rounded-lg text-xs font-semibold text-foreground-muted hover:text-foreground"
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span>&larr; 返回歌单列表</span>
        </Button>
        <div className="flex items-center gap-2">
          {canAddToQueue ? (
            <Button
              className="gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-xs hover:bg-accent-hover active:scale-95 disabled:cursor-wait"
              disabled={isQueueBusyComputed}
              onClick={onAddAllToQueue}
              size="sm"
              type="button"
            >
              <ListMusicIcon className="h-3.5 w-3.5" />
              <span>{isQueueBusyComputed ? "正在导入并加入队列…" : "全部加入队列"}</span>
            </Button>
          ) : null}
          {canManageLibrary ? (
            <Button
              className="h-8 w-8 text-foreground-muted hover:bg-red-500/15 hover:text-red-400"
              onClick={onDelete}
              size="icon"
              title="从曲库移除"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Playlist Meta Banner */}
      <div className="flex items-center gap-3.5 rounded-xl border border-surface-border/50 bg-surface/40 p-3">
        <div className="relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-lg border border-surface-border/60 bg-surface shadow-xs">
          {playlist.coverUrl ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              src={getArtworkSourceUrl(playlist.coverUrl)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-foreground-muted">
              <FolderIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate text-sm sm:text-base font-bold text-foreground">
            {playlist.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
            <span>共 {displayTracks.length} 首</span>
            <span className="text-surface-border">/</span>
            <span className={importedCount >= displayTracks.length ? "text-emerald-400 font-semibold" : "text-accent font-semibold"}>
              已导入 {importedCount} 首
            </span>
          </div>
        </div>
      </div>

      {/* Batch Import Toolbar */}
      {canManageLibrary && selectableTracks.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-border/60 bg-surface/50 px-3 py-2">
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-foreground-muted select-none">
            <input
              checked={allSelectableSelected}
              className="h-4 w-4 accent-accent rounded"
              disabled={isImportBusy}
              onChange={toggleSelectAll}
              type="checkbox"
            />
            <span>{allSelectableSelected ? "取消全选" : "全选未加入歌曲"}</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-foreground-muted">
              已选 {selectedKeys.length} 首
            </span>
            <Button
              className="rounded-lg h-7 px-2.5 text-xs font-medium border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedKeys.length === 0 || isImportBusy}
              onClick={() => void importSelectedTracks()}
              size="sm"
              type="button"
              variant="outline"
            >
              {isImportBusy ? "加入中…" : "加入曲库"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Track List */}
      <div className="divide-y divide-surface-border/40 overflow-hidden rounded-xl border border-surface-border/50 bg-surface/30">
        {remoteLoading ? (
          <p className="px-3 py-6 text-center text-xs text-foreground-muted">正在加载歌单歌曲信息…</p>
        ) : displayTracks.length > 0 ? (
          displayTracks.map((item, index) => {
            const isImporting = isTrackItemImporting(item);
            const isSelected = selectedKeys.includes(item.id);

            return (
              <div
                key={item.id}
                className="group flex min-w-0 items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-hover/60"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {!item.isInRoom && canManageLibrary && item.providerTrack ? (
                    <input
                      checked={isSelected}
                      className="h-3.5 w-3.5 accent-accent rounded shrink-0 cursor-pointer"
                      disabled={isImportBusy}
                      onChange={() => toggleTrackSelect(item.id)}
                      type="checkbox"
                    />
                  ) : (
                    <span className="w-4 shrink-0 text-center font-mono text-xs text-foreground-muted/60">
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-semibold text-foreground" title={item.title}>
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-foreground-muted" title={`${item.artist}${item.album ? ` / ${item.album}` : ""}`}>
                      {item.artist}
                      {item.album ? ` / ${item.album}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-right">
                  <span className="tabular-nums font-mono text-xs text-foreground-muted/70">
                    {formatDuration(item.durationMs)}
                  </span>
                  {item.isInRoom ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                      <CheckIcon className="h-3 w-3" />
                      <span>已在曲库</span>
                    </span>
                  ) : canManageLibrary && item.providerTrack ? (
                    <button
                      className="h-7 rounded-md px-2.5 text-xs font-medium border border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isImporting || isImportBusy}
                      onClick={() => void importSingleTrack(item)}
                      type="button"
                    >
                      {isImporting ? "加入中…" : "加入曲库"}
                    </button>
                  ) : (
                    <span className="text-xs text-foreground-muted/60">未加入</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-xs text-foreground-muted">歌单中没有曲目</p>
        )}
      </div>
    </div>
  );
}
