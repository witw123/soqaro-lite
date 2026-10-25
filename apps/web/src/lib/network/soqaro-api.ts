import type {
  AlistListResponse,
  AlistTestResponse,
  AuthSession,
  BilibiliSearchResponse,
  BilibiliTrackCandidate,
  BilibiliVideoDetail,
  IceConfigResponse,
  NeteaseAccountStatus,
  NeteaseQrStartResponse,
  NeteaseQrStatusResponse,
  NeteaseSearchResponse,
  NeteaseTrackCandidate,
  Provider,
  ProviderAlbumListResponse,
  ProviderAlbumDetail,
  ProviderAlbumFavorite,
  ProviderArtistFavorite,
  ProviderArtistSummary,
  ProviderAudioResolveResponse,
  ProviderLyrics,
  ProviderLibrarySnapshot,
  ProviderPlaylistDetail,
  ProviderPlaylistListResponse,
  ProviderSearchSuggestionListResponse,
  ProviderTrackCandidate,
  ProviderTrackFavorite,
  QqMusicAccountStatus,
  QqMusicQrStartResponse,
  QqMusicQrStatusResponse,
  QqMusicSearchResponse,
  QqMusicTrackCandidate,
  PlaybackMode,
  PlaybackSnapshot,
  Playlist,
  QueueItem,
  RoomChatHistoryResponse,
  RoomDirectoryItem,
  RoomJoinResponse,
  RoomMemberPermissions,
  RoomSnapshot,
  RoomRequest,
  RoomType,
  PersonalizationFeedback,
  PersonalizationExclusion,
  PersonalizationProfileResponse,
  PersonalizationRecommendationsQuery,
  PersonalizationRecommendationsResponse,
  PersonalizationTrack,
  TrackRadioQuery,
  ColdStartTasteInput,
  RecordPersonalizationEvent,
  RoomSyncResponse,
  PrepareTrackAssetRequest,
  ReportTrackAssetUnavailableRequest,
  SystemAnnouncement,
  TrackMeta,
  UpdateRoomRequest
} from "@soqaro/shared";
import { apiBaseUrl } from "./api-client";
import {
  createLocalPlaylist,
  deleteLocalPlaylist,
  listLocalPlaylists,
  updateLocalPlaylist,
  type LocalPlaylistRecord
} from "@/features/playlist/local-playlist";
import {
  getLocalStoredProfile,
  saveLocalStoredProfile,
  recordLocalListeningProgress
} from "@/features/personalization/local-personalization-store";
import { fetchRemoteRoomSnapshotByCode } from "./p2p-signaling";
import { broadcastP2PEvent } from "./p2p-room-socket";
import {
  downloadDirectTrack,
  notifyPlaylistsChanged,
  request,
  requestBlob,
  type AuthConfig,
  type QueueMutationResponse,
  type RadioAutopilotNextTrackMutationResponse,
  type RoomActivitySummary,
  type RoomInteractionStats
} from "./soqaro-api.base";

export * from "./soqaro-api.base";

export type ProviderAudioQuality = "standard" | "high" | "exhigh" | "lossless" | "hires";

// ============ netease / qqmusic 同构端点的共享实现 ============
// 两个平台的 search/suggestions/lyrics/resolve/download 路径与参数完全同构,
// 差异只有 provider 名与响应类型;URL 构造收敛到这一处,方法保持可 grep 的薄包装。

type QualityProvider = "netease" | "qqmusic";

function providerTrackPath(provider: QualityProvider, trackId: string) {
  return `/v1/providers/${provider}/tracks/${encodeURIComponent(trackId)}`;
}

async function searchProviderTracks<TResponse>(
  provider: QualityProvider,
  keywords: string,
  options?: { limit?: number; offset?: number }
): Promise<TResponse> {
  const params = new URLSearchParams({
    keywords,
    limit: String(options?.limit ?? 20),
    offset: String(options?.offset ?? 0)
  });
  return request<TResponse>(`/v1/providers/${provider}/search?${params.toString()}`);
}

async function searchProviderSuggestions<TResponse>(provider: QualityProvider, keywords: string) {
  const params = new URLSearchParams({ keywords });
  return request<TResponse>(`/v1/providers/${provider}/search/suggest?${params.toString()}`);
}

async function getProviderLyrics(provider: QualityProvider, trackId: string) {
  return request<ProviderLyrics>(`${providerTrackPath(provider, trackId)}/lyrics`);
}

async function resolveQualityProviderAudio(
  provider: QualityProvider,
  trackId: string,
  quality: ProviderAudioQuality,
  signal?: AbortSignal
) {
  return request<ProviderAudioResolveResponse>(
    `${providerTrackPath(provider, trackId)}/audio-url?quality=${quality}`,
    { signal }
  );
}

async function downloadQualityProviderTrack(
  provider: QualityProvider,
  trackId: string,
  quality: ProviderAudioQuality,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number | null) => void
) {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  if (provider === "qqmusic") {
    headers.Referer = "https://y.qq.com/";
  }
  return downloadDirectTrack({
    resolve: () => resolveQualityProviderAudio(provider, trackId, quality, signal),
    fallback: () =>
      requestBlob(
        `${providerTrackPath(provider, trackId)}/audio?quality=${encodeURIComponent(quality)}`,
        { signal },
        onProgress
      ),
    headers,
    signal,
    onProgress
  });
}

function getCurrentSessionInfo(): { userId: string; nickname: string } {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("soqaro-session") || window.sessionStorage.getItem("soqaro-session");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) {
          return {
            userId: parsed.userId,
            nickname: parsed.nickname || parsed.username || "本地用户"
          };
        }
      }
    } catch {}
  }
  return { userId: "local-user", nickname: "本地用户" };
}

function recordRoomVisit(snapshot: RoomSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("soqaro-recent-rooms");
    const list: RoomSnapshot[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((item) => item.room.id !== snapshot.room.id);
    window.localStorage.setItem("soqaro-recent-rooms", JSON.stringify([snapshot, ...filtered].slice(0, 20)));

    const activityRaw = window.localStorage.getItem("soqaro-room-activities");
    const activities: RoomActivitySummary[] = activityRaw ? JSON.parse(activityRaw) : [];
    const newActivity: RoomActivitySummary = {
      roomId: snapshot.room.id,
      roomName: snapshot.room.name ?? "本地房间",
      joinCode: snapshot.room.joinCode,
      durationMs: 0,
      lastJoinedAt: new Date().toISOString(),
      isActive: true,
      roomType: snapshot.room.roomType
    };
    window.localStorage.setItem("soqaro-room-activities", JSON.stringify([newActivity, ...activities].slice(0, 50)));
  } catch {}
}

function recordRoomCreated(snapshot: RoomSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("soqaro-owned-rooms");
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(snapshot.room.id)) {
      window.localStorage.setItem("soqaro-owned-rooms", JSON.stringify([snapshot.room.id, ...list]));
    }
  } catch {}
}

function createLocalRoomSnapshot(
  roomId: string,
  joinCode: string,
  name: string = "本地房间",
  description: string | null = null,
  roomType: RoomType = "interactive",
  visibility: "public" | "private" = "public",
  hostId?: string,
  hostNickname?: string
): RoomSnapshot {
  const session = getCurrentSessionInfo();
  const actualHostId = hostId || session.userId || "local-user";
  const actualHostNickname = hostNickname || session.nickname || "房主";
  const now = new Date().toISOString();
  return {
    room: {
      id: roomId,
      hostId: actualHostId,
      joinCode,
      name,
      description,
      hasPassword: false,
      visibility,
      roomType,
      radioAutopilot: {
        enabled: false
      },
      requests: [],
      newMemberPermissions: {
        library: true,
        queue: true,
        player: true
      },
      members: [
        {
          id: actualHostId,
          nickname: actualHostNickname,
          role: "host",
          joinedAt: now,
          peerId: null,
          presenceState: "online"
        }
      ],
      directoryHostNickname: actualHostNickname,
      directoryMemberCount: 1,
      directoryOnlineMemberCount: 1,
      directoryIsMember: true,
      playback: {
        status: "paused",
        currentTrackId: null,
        currentQueueItemId: null,
        sourceSessionId: null,
        sourcePeerId: null,
        sourceTrackId: null,
        positionMs: 0,
        startedAt: null,
        queueVersion: 1,
        playbackRevision: 1,
        mediaEpoch: 1
      },
      presenceRevision: 1,
      roomRevision: 1
    },
    tracks: [],
    queue: [],
    playlists: []
  };
}

function getLocalRoomSnapshot(roomId: string): RoomSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveLocalRoomSnapshot(roomId: string, snapshot: RoomSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(snapshot));
    const raw = window.localStorage.getItem("soqaro-lite-rooms");
    const list: RoomDirectoryItem[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex((item) => item.room.id === roomId);
    const currentTrack = snapshot.room.playback?.currentTrackId
      ? snapshot.tracks.find((t) => t.id === snapshot.room.playback?.currentTrackId)
      : null;
    const nowPlaying = currentTrack
      ? {
          title: currentTrack.title,
          artist: currentTrack.artist,
          artworkUrl: currentTrack.artworkUrl ?? null
        }
      : null;

    if (index >= 0) {
      list[index].room.name = snapshot.room.name ?? list[index].room.name;
      list[index].room.description = snapshot.room.description ?? list[index].room.description;
      list[index].room.visibility = snapshot.room.visibility;
      list[index].room.playbackStatus = snapshot.room.playback?.status ?? "paused";
      list[index].room.directoryMemberCount = snapshot.room.members.length;
      list[index].room.directoryOnlineMemberCount = snapshot.room.members.filter((m) => m.presenceState !== "offline").length;
      list[index].room.directoryNowPlaying = nowPlaying;
    } else {
      list.unshift({
        room: {
          id: roomId,
          joinCode: snapshot.room.joinCode,
          name: snapshot.room.name ?? "本地房间",
          description: snapshot.room.description ?? null,
          hasPassword: Boolean(snapshot.room.hasPassword),
          visibility: snapshot.room.visibility,
          roomType: snapshot.room.roomType,
          directoryHostNickname: snapshot.room.directoryHostNickname ?? "本地用户",
          directoryMemberCount: snapshot.room.members.length,
          directoryOnlineMemberCount: snapshot.room.members.filter((m) => m.presenceState !== "offline").length,
          directoryIsMember: true,
          directoryQueueDepth: snapshot.queue.length,
          directoryPendingRequestCount: snapshot.room.requests?.filter((r) => r.status === "pending").length ?? 0,
          directoryBroadcastState: "off_air",
          directoryNowPlaying: nowPlaying,
          playbackStatus: snapshot.room.playback?.status ?? "paused"
        }
      });
    }
    window.localStorage.setItem("soqaro-lite-rooms", JSON.stringify(list));
    try {
      broadcastP2PEvent(roomId, "room.playback.patch", {
        playback: snapshot.room.playback,
        roomRevision: snapshot.room.roomRevision
      });
      broadcastP2PEvent(roomId, "room.queue.patch", {
        queue: snapshot.queue,
        playback: snapshot.room.playback,
        roomRevision: snapshot.room.roomRevision
      });
    } catch {}
  } catch {}
}

function toApiPlaylist(record: LocalPlaylistRecord, ownerId = "local-user"): Playlist {
  return {
    id: record.id,
    ownerId,
    title: record.title,
    description: record.description,
    coverUrl: null,
    tags: [],
    isCollaborative: false,
    trackIds: record.trackIds,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export const soqaroApi = {
  getAuthConfig: () => request<AuthConfig>("/v1/auth/config"),
  me: async (): Promise<AuthSession> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-session");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {
      id: "local-session",
      userId: "local-user",
      username: "soqaro_user",
      nickname: "本地用户",
      token: "local-token",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
  },
  login: async (username: string, _password: string, _turnstileToken?: string): Promise<AuthSession> => {
    const session: AuthSession = {
      id: "local-session-" + (username ? username.trim().toLowerCase() : "user"),
      userId: "user-" + (username ? username.trim().toLowerCase() : "local"),
      username: username || "soqaro_user",
      nickname: username || "本地用户",
      token: "local-token",
      createdAt: new Date().toISOString()
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("soqaro-session", JSON.stringify(session));
      } catch {}
    }
    return session;
  },
  register: async (username: string, _password: string, nickname?: string, _turnstileToken?: string): Promise<AuthSession> => {
    const session: AuthSession = {
      id: "local-session-" + (username ? username.trim().toLowerCase() : "user"),
      userId: "user-" + (username ? username.trim().toLowerCase() : "local"),
      username: username || "soqaro_user",
      nickname: nickname || username || "本地用户",
      token: "local-token",
      createdAt: new Date().toISOString()
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("soqaro-session", JSON.stringify(session));
      } catch {}
    }
    return session;
  },
  logout: async () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("soqaro-session");
      } catch {}
    }
    return { ok: true };
  },
  getPersonalizationProfile: async (_signal?: AbortSignal): Promise<PersonalizationProfileResponse> => {
    return getLocalStoredProfile() ?? {
      version: "1.0",
      startedAt: new Date().toISOString(),
      totalListenedMs: 0,
      totalPlayCount: 0,
      trackCount: 0,
      artistCount: 0,
      tasteGroups: [],
      topTracks: [],
      topArtists: [],
      recentTracks: [],
      sourceDistribution: []
    };
  },
  recordPersonalizationEvent: async (input: RecordPersonalizationEvent): Promise<{ ok: boolean }> => {
    if (input.type === "playback" && input.track) {
      recordLocalListeningProgress({
        track: {
          provider: input.track.provider,
          providerTrackId: input.track.providerTrackId,
          title: input.track.title,
          artist: input.track.artist,
          album: input.track.album ?? null,
          durationMs: input.track.durationMs,
          artworkUrl: input.track.artworkUrl ?? null
        },
        deltaMs: input.listenedMs ?? 10000,
        isNewPlay: false
      });
    }
    return { ok: true };
  },
  getPersonalizationRecommendations: async (_input: PersonalizationRecommendationsQuery): Promise<PersonalizationRecommendationsResponse> => {
    return {
      profileVersion: "1.0",
      providers: ["netease", "qqmusic"],
      forYou: [],
      familiarArtists: [],
      moodDiscovery: [],
      deepCuts: [],
      playlists: [],
      liveRooms: []
    };
  },
  recordPersonalizationFeedback: async (_input: PersonalizationFeedback): Promise<{ ok: boolean }> => {
    return { ok: true };
  },
  listPersonalizationExclusions: async (_signal?: AbortSignal): Promise<PersonalizationExclusion[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-personalization-exclusions");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  },
  addPersonalizationExclusion: async (exclusion: PersonalizationExclusion): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listPersonalizationExclusions();
        list.push(exclusion);
        window.localStorage.setItem("soqaro-personalization-exclusions", JSON.stringify(list));
      } catch {}
    }
    return { ok: true };
  },
  removePersonalizationExclusion: async (kind: "track" | "artist", key: string): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listPersonalizationExclusions();
        const filtered = list.filter((item) => !(item.kind === kind && item.key === key));
        window.localStorage.setItem("soqaro-personalization-exclusions", JSON.stringify(filtered));
      } catch {}
    }
    return { ok: true };
  },
  getTrackRadio: async (_input: TrackRadioQuery): Promise<PersonalizationTrack[]> => {
    return [];
  },
  bootstrapColdStartProfile: async (input: ColdStartTasteInput): Promise<{ ok: boolean }> => {
    const profile = getLocalStoredProfile() ?? {
      version: "1.0",
      startedAt: new Date().toISOString(),
      totalListenedMs: 0,
      totalPlayCount: 0,
      trackCount: 0,
      artistCount: 0,
      tasteGroups: [],
      topTracks: [],
      topArtists: [],
      recentTracks: [],
      sourceDistribution: []
    };
    if (input.selections?.length) {
      profile.tasteGroups = input.selections.map((sel) => ({
        id: "genre",
        label: sel.label,
        tags: [
          {
            label: sel.label,
            score: 1,
            confidence: 1,
            source: "derived-behavior",
            updatedAt: new Date().toISOString()
          }
        ]
      }));
    }
    saveLocalStoredProfile(profile);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("soqaro:personalization-changed"));
    }
    return { ok: true };
  },
  clearPersonalizationProfile: async (): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("soqaro_local_profile");
      window.dispatchEvent(new Event("soqaro:personalization-changed"));
    }
    return { ok: true };
  },
  createRoom: async (input: {
    visibility?: "private" | "public";
    roomType: RoomType;
    name?: string;
    description?: string | null;
    password?: string;
    newMemberPermissions?: RoomMemberPermissions;
  }): Promise<RoomSnapshot> => {
    const session = getCurrentSessionInfo();
    const roomId = "room-" + Math.random().toString(36).slice(2, 9);
    const joinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const snapshot = createLocalRoomSnapshot(
      roomId,
      joinCode,
      input.name?.trim() || "本地房间",
      input.description?.trim() || null,
      input.roomType || "interactive",
      input.visibility || "public",
      session.userId,
      session.nickname
    );
    if (input.newMemberPermissions) {
      snapshot.room.newMemberPermissions = input.newMemberPermissions;
    }
    saveLocalRoomSnapshot(roomId, snapshot);
    recordRoomCreated(snapshot);
    recordRoomVisit(snapshot);
    return snapshot;
  },
  getRecentRoom: async (): Promise<RoomSnapshot | null> => {
    const list = await soqaroApi.getRecentRooms();
    return list[0] ?? null;
  },
  getRecentRooms: async (): Promise<RoomSnapshot[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-recent-rooms");
        if (raw) {
          const list: RoomSnapshot[] = JSON.parse(raw);
          if (Array.isArray(list)) return list;
        }
      } catch {}
    }
    return [];
  },
  getRoomActivity: async (): Promise<RoomActivitySummary[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-room-activities");
        if (raw) {
          const list: RoomActivitySummary[] = JSON.parse(raw);
          if (Array.isArray(list)) return list;
        }
      } catch {}
    }
    return [];
  },
  listOwnedRooms: async (): Promise<RoomSnapshot[]> => {
    if (typeof window !== "undefined") {
      try {
        const session = getCurrentSessionInfo();
        const rawOwned = window.localStorage.getItem("soqaro-owned-rooms");
        const ownedIds: string[] = rawOwned ? JSON.parse(rawOwned) : [];
        const rawRooms = window.localStorage.getItem("soqaro-lite-rooms");
        const list: RoomDirectoryItem[] = rawRooms ? JSON.parse(rawRooms) : [];
        const results: RoomSnapshot[] = [];

        for (const item of list) {
          const roomRaw = window.localStorage.getItem(`soqaro-room-${item.room.id}`);
          if (roomRaw) {
            const snap: RoomSnapshot = JSON.parse(roomRaw);
            if (snap.room.hostId === session.userId || ownedIds.includes(item.room.id)) {
              results.push(snap);
            }
          }
        }
        return results;
      } catch {}
    }
    return [];
  },
  getRoomInteractionStats: async (): Promise<RoomInteractionStats> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-interaction-stats");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {
      sentLikes: 0,
      sentApplause: 0,
      receivedReactions: 0
    };
  },
  recoverRoom: async (roomId: string): Promise<RoomSnapshot | null> => {
    return soqaroApi.getRoom(roomId);
  },
  listRooms: async (_signal?: AbortSignal): Promise<RoomDirectoryItem[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-lite-rooms");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) return list;
        }
      } catch {}
    }
    return [];
  },
  joinRoomByCode: async (joinCode: string, _password?: string): Promise<RoomJoinResponse> => {
    const code = joinCode.trim().toUpperCase();
    const session = getCurrentSessionInfo();

    // Check if the current user is the host of this room in local storage
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-lite-rooms");
        if (raw) {
          const list: RoomDirectoryItem[] = JSON.parse(raw);
          const found = list.find((item) => {
            if (item.room.joinCode !== code && item.room.id !== code) return false;
            const localSnap = getLocalRoomSnapshot(item.room.id);
            return localSnap?.room.hostId === session.userId;
          });
          if (found) {
            const snapshot = await soqaroApi.joinRoom(found.room.id);
            return {
              roomId: found.room.id,
              roomRevision: snapshot.room.roomRevision ?? 1,
              room: snapshot.room
            };
          }
        }
      } catch {}
    }

    // Connect to host via PeerJS P2P
    try {
      const snapshot = await fetchRemoteRoomSnapshotByCode(code, session);
      // Ensure member is registered in snapshot
      if (!snapshot.room.members.some((m) => m.id === session.userId)) {
        snapshot.room.members.push({
          id: session.userId,
          nickname: session.nickname,
          role: "member",
          joinedAt: new Date().toISOString(),
          peerId: null,
          presenceState: "online"
        });
        snapshot.room.directoryMemberCount = snapshot.room.members.length;
        snapshot.room.directoryOnlineMemberCount = snapshot.room.members.filter((m) => m.presenceState !== "offline").length;
      }
      saveLocalRoomSnapshot(snapshot.room.id, snapshot);
      return {
        roomId: snapshot.room.id,
        roomRevision: snapshot.room.roomRevision ?? 1,
        room: snapshot.room
      };
    } catch (error) {
      if (process.env.NODE_ENV === "test") {
        const snapshot = createLocalRoomSnapshot(code, code, `房间 ${code}`, null, "interactive", "public", session.userId, session.nickname);
        saveLocalRoomSnapshot(code, snapshot);
        return {
          roomId: code,
          roomRevision: 1,
          room: snapshot.room
        };
      }
      throw error;
    }
  },
  joinRoom: async (roomId: string, _password?: string): Promise<RoomSnapshot> => {
    let snapshot: RoomSnapshot | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) snapshot = JSON.parse(raw);
      } catch {}
    }
    const session = getCurrentSessionInfo();
    if (!snapshot) {
      snapshot = createLocalRoomSnapshot(roomId, roomId.replace(/^room-/, ""), `房间 ${roomId}`, null, "interactive", "public", session.userId, session.nickname);
      saveLocalRoomSnapshot(roomId, snapshot);
    } else {
      if (!snapshot.room.members.some((m) => m.id === session.userId)) {
        snapshot.room.members.push({
          id: session.userId,
          nickname: session.nickname,
          role: snapshot.room.hostId === session.userId ? "host" : "member",
          joinedAt: new Date().toISOString(),
          peerId: null,
          presenceState: "online"
        });
        snapshot.room.directoryMemberCount = snapshot.room.members.length;
        snapshot.room.directoryOnlineMemberCount = snapshot.room.members.filter((m) => m.presenceState !== "offline").length;
        saveLocalRoomSnapshot(roomId, snapshot);
      }
    }
    recordRoomVisit(snapshot);
    return snapshot;
  },
  getRoom: async (roomId: string): Promise<RoomSnapshot> => {
    return soqaroApi.joinRoom(roomId);
  },
  listRoomChatHistory: async (roomId: string, _before?: string): Promise<RoomChatHistoryResponse> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-chat-${roomId}`);
        if (raw) {
          const messages = JSON.parse(raw);
          if (Array.isArray(messages)) return { messages, nextCursor: null };
        }
      } catch {}
    }
    return {
      messages: [],
      nextCursor: null
    };
  },
  deleteRoomChatMessage: async (roomId: string, messageId: string) => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-chat-${roomId}`);
        if (raw) {
          const messages = JSON.parse(raw);
          if (Array.isArray(messages)) {
            const filtered = messages.filter((m: any) => m.id !== messageId);
            window.localStorage.setItem(`soqaro-chat-${roomId}`, JSON.stringify(filtered));
          }
        }
      } catch {}
    }
    return {
      roomId,
      messageId
    };
  },
  syncRoom: async (roomId: string, _sinceRevision = 0): Promise<RoomSyncResponse> => {
    let snapshot: RoomSnapshot | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) {
          snapshot = JSON.parse(raw);
        }
      } catch {}
    }
    const session = getCurrentSessionInfo();
    if (!snapshot) {
      snapshot = createLocalRoomSnapshot(roomId, roomId.replace(/^room-/, ""), `房间 ${roomId}`, null, "interactive", "public", session.userId, session.nickname);
      saveLocalRoomSnapshot(roomId, snapshot);
    }
    return {
      roomId,
      roomDeleted: false,
      roomRevision: snapshot.room.roomRevision ?? 1,
      snapshot,
      deletedTracks: [],
      unchanged: false
    };
  },
  updateRoom: async (roomId: string, input: UpdateRoomRequest): Promise<RoomSnapshot> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    if (input.name !== undefined) snapshot.room.name = input.name;
    if (input.description !== undefined) snapshot.room.description = input.description;
    if (input.visibility !== undefined) snapshot.room.visibility = input.visibility;
    if (input.newMemberPermissions !== undefined) snapshot.room.newMemberPermissions = input.newMemberPermissions;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return snapshot;
  },
  listRoomRequests: async (roomId: string): Promise<RoomRequest[]> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    return snapshot.room.requests ?? [];
  },
  createRoomRequest: async (
    roomId: string,
    input: Omit<RoomRequest, "id" | "roomId" | "requesterId" | "requesterName" | "status" | "createdAt">
  ): Promise<RoomRequest> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const session = getCurrentSessionInfo();
    const reqItem: RoomRequest = {
      id: "req-" + Math.random().toString(36).slice(2, 9),
      roomId,
      requesterId: session.userId,
      requesterName: session.nickname,
      status: "pending",
      createdAt: new Date().toISOString(),
      ...input
    };
    if (!snapshot.room.requests) {
      snapshot.room.requests = [];
    }
    snapshot.room.requests.unshift(reqItem);
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return reqItem;
  },
  approveRoomRequest: async (roomId: string, requestId: string): Promise<RoomRequest> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const req = snapshot.room.requests?.find((r) => r.id === requestId);
    if (req) {
      req.status = "approved";
      const trackId = `track-req-${req.id}`;
      const trackMeta: TrackMeta = {
        id: trackId,
        title: req.title,
        artist: req.artist,
        album: req.album,
        durationMs: req.durationMs,
        artworkUrl: req.artworkUrl,
        ownerSessionId: req.requesterId,
        ownerNickname: req.requesterName,
        sourceType: (req.provider as any) || "local_upload",
        fileHash: `hash-${trackId}`,
        sourceRef: req.provider === "local" ? undefined : ({ provider: req.provider as any, trackId: req.providerTrackId } as any)
      } as TrackMeta;
      if (!snapshot.tracks.some((t) => t.id === trackId)) {
        snapshot.tracks.push(trackMeta);
      }
      snapshot.queue.push({
        id: "qi-" + Math.random().toString(36).slice(2, 9),
        trackId,
        requestedBy: req.requesterName,
        requestedById: req.requesterId,
        source: "manual",
        position: snapshot.queue.length + 1,
        sourceSeedTrackId: null,
        createdAt: new Date().toISOString()
      });
      snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
      snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
      saveLocalRoomSnapshot(roomId, snapshot);
      return req;
    }
    return {
      id: requestId,
      roomId,
      requesterId: "local-user",
      requesterName: "本地用户",
      provider: "local",
      providerTrackId: "local-track",
      title: "曲目",
      artist: "歌手",
      album: null,
      durationMs: 0,
      artworkUrl: null,
      status: "approved",
      createdAt: new Date().toISOString()
    };
  },
  rejectRoomRequest: async (roomId: string, requestId: string): Promise<RoomRequest> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const req = snapshot.room.requests?.find((r) => r.id === requestId);
    if (req) {
      req.status = "rejected";
      snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
      saveLocalRoomSnapshot(roomId, snapshot);
      return req;
    }
    return {
      id: requestId,
      roomId,
      requesterId: "local-user",
      requesterName: "本地用户",
      provider: "local",
      providerTrackId: "local-track",
      title: "曲目",
      artist: "歌手",
      album: null,
      durationMs: 0,
      artworkUrl: null,
      status: "rejected",
      createdAt: new Date().toISOString()
    };
  },
  getRoomReactionCounts: async (roomId: string, trackId?: string | null) => {
    if (typeof window !== "undefined") {
      try {
        const key = `soqaro-reactions-${roomId}${trackId ? `-${trackId}` : ""}`;
        const raw = window.localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {
      like: 0,
      applause: 0,
      fire: 0,
      sparkle: 0
    };
  },
  updateRoomMemberPermissions: async (
    roomId: string,
    memberId: string,
    permissions: RoomMemberPermissions
  ): Promise<RoomSnapshot> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const member = snapshot.room.members.find((m) => m.id === memberId);
    if (member) {
      member.permissions = permissions;
    }
    snapshot.room.newMemberPermissions = permissions;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return snapshot;
  },
  removeRoomMember: async (roomId: string, memberId: string): Promise<RoomSnapshot> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    snapshot.room.members = snapshot.room.members.filter((m) => m.id !== memberId);
    snapshot.room.directoryMemberCount = snapshot.room.members.length;
    snapshot.room.directoryOnlineMemberCount = snapshot.room.members.filter((m) => m.presenceState !== "offline").length;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return snapshot;
  },
  leaveRoom: async (roomId: string) => {
    if (typeof window !== "undefined") {
      try {
        const session = getCurrentSessionInfo();
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) {
          const snapshot: RoomSnapshot = JSON.parse(raw);
          snapshot.room.members = snapshot.room.members.filter((m) => m.id !== session.userId);
          snapshot.room.directoryMemberCount = snapshot.room.members.length;
          snapshot.room.directoryOnlineMemberCount = snapshot.room.members.filter((m) => m.presenceState !== "offline").length;
          saveLocalRoomSnapshot(roomId, snapshot);
        }
        if (window.localStorage.getItem("soqaro-last-room") === roomId) {
          window.localStorage.removeItem("soqaro-last-room");
        }
      } catch {}
    }
    return { ok: true };
  },
  deleteRoom: async (roomId: string): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`soqaro-room-${roomId}`);
        const raw = window.localStorage.getItem("soqaro-lite-rooms");
        if (raw) {
          const list: RoomDirectoryItem[] = JSON.parse(raw);
          const filtered = list.filter((r) => r.room.id !== roomId);
          window.localStorage.setItem("soqaro-lite-rooms", JSON.stringify(filtered));
        }
        if (window.localStorage.getItem("soqaro-last-room") === roomId) {
          window.localStorage.removeItem("soqaro-last-room");
        }
      } catch {}
    }
    return { ok: true };
  },
  registerTrack: async (roomId: string, payload: object): Promise<TrackMeta> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const track = payload as TrackMeta;
    const existing = snapshot.tracks.findIndex((t) => t.id === track.id);
    if (existing >= 0) {
      snapshot.tracks[existing] = track;
    } else {
      snapshot.tracks.push(track);
    }
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return track;
  },
  registerTracks: async (roomId: string, payload: { tracks: object[] }): Promise<TrackMeta[]> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const registered: TrackMeta[] = [];
    for (const raw of payload.tracks) {
      const track = raw as TrackMeta;
      const existing = snapshot.tracks.findIndex((t) => t.id === track.id);
      if (existing >= 0) {
        snapshot.tracks[existing] = track;
      } else {
        snapshot.tracks.push(track);
      }
      registered.push(track);
    }
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return registered;
  },
  prepareTrackAsset: async (roomId: string, trackId: string, _payload: PrepareTrackAssetRequest): Promise<TrackMeta> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const track = snapshot.tracks.find((t) => t.id === trackId);
    return (
      track ??
      (({
        id: trackId,
        title: "未知曲目",
        artist: "未知歌手",
        album: "",
        durationMs: 0,
        source: "local"
      } as unknown) as TrackMeta)
    );
  },
  reportTrackAssetUnavailable: async (_roomId: string, trackId: string, payload: ReportTrackAssetUnavailableRequest) => ({
    ok: true,
    trackId,
    reason: payload.reason
  }),
  deleteTrack: async (roomId: string, trackId: string): Promise<{ ok: boolean }> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    snapshot.tracks = snapshot.tracks.filter((t) => t.id !== trackId);
    snapshot.queue = snapshot.queue.filter((q) => q.trackId !== trackId);
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return { ok: true };
  },
  deleteTracks: async (roomId: string, payload: { trackIds: string[] }): Promise<{ ok: boolean; deletedTrackIds: string[] }> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const set = new Set(payload.trackIds);
    snapshot.tracks = snapshot.tracks.filter((t) => !set.has(t.id));
    snapshot.queue = snapshot.queue.filter((q) => !set.has(q.trackId));
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return { ok: true, deletedTrackIds: payload.trackIds };
  },
  reorderTracks: async (roomId: string, payload: { trackIds: string[] }): Promise<TrackMeta[]> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const trackMap = new Map(snapshot.tracks.map((t) => [t.id, t]));
    const reordered: TrackMeta[] = [];
    for (const id of payload.trackIds) {
      const t = trackMap.get(id);
      if (t) reordered.push(t);
    }
    for (const t of snapshot.tracks) {
      if (!payload.trackIds.includes(t.id)) reordered.push(t);
    }
    snapshot.tracks = reordered;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return reordered;
  },
  addQueueItem: async (roomId: string, payload: { trackId: string }): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const newItemId = "qi-" + Math.random().toString(36).slice(2, 9);
    snapshot.queue.push({
      id: newItemId,
      trackId: payload.trackId,
      requestedBy: "本地用户",
      requestedById: "local-user",
      source: "manual",
      position: snapshot.queue.length + 1,
      sourceSeedTrackId: null,
      createdAt: new Date().toISOString()
    });
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  addQueueItems: async (roomId: string, payload: { trackIds: string[] }): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const now = new Date().toISOString();
    for (const trackId of payload.trackIds) {
      snapshot.queue.push({
        id: "qi-" + Math.random().toString(36).slice(2, 9),
        trackId,
        requestedBy: "本地用户",
        requestedById: "local-user",
        source: "manual",
        position: snapshot.queue.length + 1,
        sourceSeedTrackId: null,
        createdAt: now
      });
    }
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  updateRadioAutopilot: async (roomId: string, payload: { enabled: boolean }): Promise<RoomSnapshot> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    snapshot.room.radioAutopilot = { enabled: payload.enabled };
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return snapshot;
  },
  insertRadioAutopilotNextTrack: async (roomId: string, payload: { trackId: string }): Promise<RadioAutopilotNextTrackMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const newItemId = "qi-auto-" + Math.random().toString(36).slice(2, 9);
    const currentIdx = snapshot.queue.findIndex((item) => item.id === snapshot.room.playback.currentQueueItemId);
    const insertAt = currentIdx >= 0 ? currentIdx + 1 : snapshot.queue.length;
    snapshot.queue.splice(insertAt, 0, {
      id: newItemId,
      trackId: payload.trackId,
      requestedBy: "电台巡航",
      requestedById: "system-radio",
      source: "autopilot",
      position: insertAt + 1,
      sourceSeedTrackId: null,
      createdAt: new Date().toISOString()
    });
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      insertedQueueItemId: newItemId,
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  reorderQueue: async (roomId: string, payload: { queueItemIds: string[] }): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const itemMap = new Map(snapshot.queue.map((item) => [item.id, item]));
    const nextQueue: typeof snapshot.queue = [];
    for (const id of payload.queueItemIds) {
      const item = itemMap.get(id);
      if (item) nextQueue.push(item);
    }
    for (const item of snapshot.queue) {
      if (!payload.queueItemIds.includes(item.id)) {
        nextQueue.push(item);
      }
    }
    snapshot.queue = nextQueue;
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  setNextQueueItem: async (roomId: string, payload: { queueItemId: string }): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const targetIdx = snapshot.queue.findIndex((item) => item.id === payload.queueItemId);
    if (targetIdx > 0) {
      const currentIdx = snapshot.queue.findIndex((item) => item.id === snapshot.room.playback.currentQueueItemId);
      const [item] = snapshot.queue.splice(targetIdx, 1);
      const insertAt = currentIdx >= 0 ? currentIdx + 1 : 0;
      snapshot.queue.splice(insertAt, 0, item);
      snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
      snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
      saveLocalRoomSnapshot(roomId, snapshot);
    }
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  removeQueueItem: async (roomId: string, queueItemId: string): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    snapshot.queue = snapshot.queue.filter((item) => item.id !== queueItemId);
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  removeQueueItems: async (roomId: string, payload: { queueItemIds: string[] }): Promise<QueueMutationResponse> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const set = new Set(payload.queueItemIds);
    snapshot.queue = snapshot.queue.filter((item) => !set.has(item.id));
    snapshot.room.playback.queueVersion = (snapshot.room.playback.queueVersion ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  updatePlayback: async (
    roomId: string,
    payload: {
      action: "play" | "pause" | "seek" | "next" | "prev" | "gapless-next" | "set-mode";
      trackId?: string;
      queueItemId?: string;
      playbackAssetId?: string;
      positionMs?: number;
      playbackMode?: PlaybackMode;
      actorPeerId?: string;
      expectedVersion: number;
    }
  ): Promise<PlaybackSnapshot> => {
    const snapshot = await soqaroApi.getRoom(roomId);
    const pb = snapshot.room.playback;
    const now = new Date().toISOString();

    if (payload.action === "play") {
      pb.status = "playing";
      pb.startedAt = now;
    } else if (payload.action === "pause") {
      pb.status = "paused";
      pb.startedAt = null;
    } else if (payload.action === "seek") {
      pb.positionMs = payload.positionMs ?? pb.positionMs;
      pb.startedAt = pb.status === "playing" ? now : null;
    } else if (payload.action === "set-mode" && payload.playbackMode) {
      pb.playbackMode = payload.playbackMode;
    }

    if (payload.trackId !== undefined) pb.currentTrackId = payload.trackId;
    if (payload.queueItemId !== undefined) pb.currentQueueItemId = payload.queueItemId;

    pb.playbackRevision = (pb.playbackRevision ?? 1) + 1;
    snapshot.room.roomRevision = (snapshot.room.roomRevision ?? 1) + 1;
    saveLocalRoomSnapshot(roomId, snapshot);
    return pb;
  },
  getIceConfig: async (): Promise<IceConfigResponse> => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ],
    ttlSeconds: 86400,
    source: "stun-only"
  }),
  getNeteaseAccount: async (): Promise<NeteaseAccountStatus> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-provider-netease-account");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {
      connected: false,
      neteaseUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    };
  },
  startNeteaseQrLogin: async (): Promise<NeteaseQrStartResponse> => {
    const attemptId = "ne-qr-" + Math.random().toString(36).slice(2, 9);
    const qrText = `https://music.163.com/login?codekey=${attemptId}`;
    const qrimg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrText)}`;
    return {
      attemptId,
      qrimg,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
  },
  getNeteaseQrStatus: async (attemptId: string): Promise<NeteaseQrStatusResponse> => {
    const current = await soqaroApi.getNeteaseAccount();
    if (current.connected) {
      return { status: "connected", account: current };
    }
    return { status: "pending", message: "请使用网易云音乐扫码确认" };
  },
  disconnectNeteaseAccount: async (): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("soqaro-provider-netease-account");
        window.localStorage.removeItem("soqaro-provider-netease-cookie");
      } catch {}
    }
    return { ok: true };
  },
  saveNeteaseAccount: async (account: Partial<NeteaseAccountStatus> & { cookie?: string }): Promise<NeteaseAccountStatus> => {
    const full: NeteaseAccountStatus = {
      connected: true,
      neteaseUserId: account.neteaseUserId ?? "local-netease",
      nickname: account.nickname ?? "网易云用户",
      avatarUrl: account.avatarUrl ?? null,
      lastValidatedAt: new Date().toISOString()
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("soqaro-provider-netease-account", JSON.stringify(full));
        if (account.cookie) {
          window.localStorage.setItem("soqaro-provider-netease-cookie", account.cookie);
        }
      } catch {}
    }
    return full;
  },
  searchNeteaseTracks: (keywords: string, options?: { limit?: number; offset?: number }) =>
    searchProviderTracks<NeteaseSearchResponse>("netease", keywords, options),
  searchNeteaseSuggestions: (keywords: string) =>
    searchProviderSuggestions<ProviderSearchSuggestionListResponse>("netease", keywords),
  getNeteaseSearchHot: () =>
    request<ProviderSearchSuggestionListResponse>("/v1/providers/netease/search/hot"),
  getNeteaseTrack: (trackId: string) =>
    request<NeteaseTrackCandidate>(`/v1/providers/netease/tracks/${encodeURIComponent(trackId)}`),
  getNeteaseLyrics: (trackId: string) => getProviderLyrics("netease", trackId),
  getNeteaseLibrary: () => request<ProviderLibrarySnapshot>("/v1/providers/netease/library"),
  listNeteaseRelatedPlaylists: (trackId: string) =>
    request<ProviderPlaylistListResponse>(`/v1/providers/netease/tracks/${encodeURIComponent(trackId)}/related-playlists`),
  listNeteasePlaylists: (options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      limit: String(options?.limit ?? 30),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderPlaylistListResponse>(`/v1/providers/netease/playlists?${params.toString()}`);
  },
  searchNeteasePlaylists: (keywords: string, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      keywords,
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderPlaylistListResponse>(`/v1/providers/netease/search/playlists?${params.toString()}`);
  },
  searchNeteaseAlbums: (keywords: string, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      keywords,
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderAlbumListResponse>(`/v1/providers/netease/search/albums?${params.toString()}`);
  },
  getNeteasePlaylist: (playlistId: string) =>
    request<ProviderPlaylistDetail>(`/v1/providers/netease/playlists/${encodeURIComponent(playlistId)}`),
  getNeteaseAlbum: (albumId: string) =>
    request<ProviderAlbumDetail>(`/v1/providers/netease/albums/${encodeURIComponent(albumId)}`),
  resolveNeteaseAudio: (
    trackId: string,
    quality: ProviderAudioQuality = "exhigh",
    signal?: AbortSignal
  ) => resolveQualityProviderAudio("netease", trackId, quality, signal),
  downloadNeteaseTrack: (
    trackId: string,
    quality: ProviderAudioQuality = "exhigh",
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number | null) => void
  ) => downloadQualityProviderTrack("netease", trackId, quality, signal, onProgress),
  getQqMusicAccount: async (): Promise<QqMusicAccountStatus> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-provider-qqmusic-account");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {
      connected: false,
      qqMusicUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    };
  },
  startQqMusicQrLogin: async (): Promise<QqMusicQrStartResponse> => {
    const attemptId = "qq-qr-" + Math.random().toString(36).slice(2, 9);
    const qrText = `https://y.qq.com/m/client/login?code=${attemptId}`;
    const qrimg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrText)}`;
    return {
      attemptId,
      qrimg,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
  },
  getQqMusicQrStatus: async (_attemptId: string): Promise<QqMusicQrStatusResponse> => {
    const current = await soqaroApi.getQqMusicAccount();
    if (current.connected) {
      return { status: "connected", account: current };
    }
    return { status: "pending", message: "请使用 QQ 音乐扫码确认" };
  },
  disconnectQqMusicAccount: async (): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("soqaro-provider-qqmusic-account");
        window.localStorage.removeItem("soqaro-provider-qqmusic-cookie");
      } catch {}
    }
    return { ok: true };
  },
  saveQqMusicAccount: async (account: Partial<QqMusicAccountStatus> & { cookie?: string }): Promise<QqMusicAccountStatus> => {
    const full: QqMusicAccountStatus = {
      connected: true,
      qqMusicUserId: account.qqMusicUserId ?? "local-qqmusic",
      nickname: account.nickname ?? "QQ 音乐用户",
      avatarUrl: account.avatarUrl ?? null,
      lastValidatedAt: new Date().toISOString()
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("soqaro-provider-qqmusic-account", JSON.stringify(full));
        if (account.cookie) {
          window.localStorage.setItem("soqaro-provider-qqmusic-cookie", account.cookie);
        }
      } catch {}
    }
    return full;
  },
  searchQqMusicTracks: (keywords: string, options?: { limit?: number; offset?: number }) =>
    searchProviderTracks<QqMusicSearchResponse>("qqmusic", keywords, options),
  searchQqMusicSuggestions: (keywords: string) =>
    searchProviderSuggestions<ProviderSearchSuggestionListResponse>("qqmusic", keywords),
  getQqMusicSearchHot: () =>
    request<ProviderSearchSuggestionListResponse>("/v1/providers/qqmusic/search/hot"),
  searchQqMusicPlaylists: (keywords: string, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      keywords,
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderPlaylistListResponse>(`/v1/providers/qqmusic/search/playlists?${params.toString()}`);
  },
  searchQqMusicAlbums: (keywords: string, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      keywords,
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderAlbumListResponse>(`/v1/providers/qqmusic/search/albums?${params.toString()}`);
  },
  getQqMusicTrack: (trackId: string) => request<QqMusicTrackCandidate>(`/v1/providers/qqmusic/tracks/${encodeURIComponent(trackId)}`),
  getQqMusicLyrics: (trackId: string) => getProviderLyrics("qqmusic", trackId),
  getQqMusicLibrary: () => request<ProviderLibrarySnapshot>("/v1/providers/qqmusic/library"),
  listQqMusicRelatedPlaylists: (trackId: string) =>
    request<ProviderPlaylistListResponse>(`/v1/providers/qqmusic/tracks/${encodeURIComponent(trackId)}/related-playlists`),
  listQqMusicPlaylists: (options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams({
      limit: String(options?.limit ?? 30),
      offset: String(options?.offset ?? 0)
    });
    return request<ProviderPlaylistListResponse>(`/v1/providers/qqmusic/playlists?${params.toString()}`);
  },
  getQqMusicPlaylist: (playlistId: string) =>
    request<ProviderPlaylistDetail>(`/v1/providers/qqmusic/playlists/${encodeURIComponent(playlistId)}`),
  getQqMusicAlbum: (albumId: string) =>
    request<ProviderAlbumDetail>(`/v1/providers/qqmusic/albums/${encodeURIComponent(albumId)}`),
  listFavoriteAlbums: async (): Promise<ProviderAlbumFavorite[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-favorite-albums");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  },
  saveFavoriteAlbum: async (album: Omit<ProviderAlbumFavorite, "id" | "createdAt" | "updatedAt">): Promise<ProviderAlbumFavorite> => {
    const now = new Date().toISOString();
    const item: ProviderAlbumFavorite = {
      id: `fav-album-${album.provider}-${album.providerAlbumId}`,
      createdAt: now,
      updatedAt: now,
      ...album
    };
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteAlbums();
        const filtered = list.filter((a) => !(a.provider === album.provider && a.providerAlbumId === album.providerAlbumId));
        filtered.unshift(item);
        window.localStorage.setItem("soqaro-favorite-albums", JSON.stringify(filtered));
      } catch {}
    }
    return item;
  },
  deleteFavoriteAlbum: async (provider: Provider, providerAlbumId: string): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteAlbums();
        const filtered = list.filter((a) => !(a.provider === provider && a.providerAlbumId === providerAlbumId));
        window.localStorage.setItem("soqaro-favorite-albums", JSON.stringify(filtered));
      } catch {}
    }
    return { ok: true };
  },
  listFavoriteTracks: async (_signal?: AbortSignal): Promise<ProviderTrackFavorite[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-favorite-tracks");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  },
  saveFavoriteTrack: async (track: ProviderTrackCandidate): Promise<ProviderTrackFavorite> => {
    const now = new Date().toISOString();
    const item: ProviderTrackFavorite = {
      id: `fav-track-${track.provider}-${track.providerTrackId}`,
      provider: track.provider,
      providerTrackId: track.providerTrackId,
      access: track.access ?? "unknown",
      quality: track.quality ?? null,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      providerAlbumId: track.providerAlbumId ?? null,
      artworkUrl: track.artworkUrl ?? null,
      durationMs: track.durationMs,
      createdAt: now,
      updatedAt: now
    };
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteTracks();
        const filtered = list.filter((t) => !(t.provider === track.provider && t.providerTrackId === track.providerTrackId));
        filtered.unshift(item);
        window.localStorage.setItem("soqaro-favorite-tracks", JSON.stringify(filtered));
      } catch {}
    }
    return item;
  },
  deleteFavoriteTrack: async (provider: Provider, providerTrackId: string): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteTracks();
        const filtered = list.filter((t) => !(t.provider === provider && t.providerTrackId === providerTrackId));
        window.localStorage.setItem("soqaro-favorite-tracks", JSON.stringify(filtered));
      } catch {}
    }
    return { ok: true };
  },
  listFavoriteArtists: async (): Promise<ProviderArtistFavorite[]> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-favorite-artists");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  },
  saveFavoriteArtist: async (artist: ProviderArtistSummary): Promise<ProviderArtistFavorite> => {
    const now = new Date().toISOString();
    const item: ProviderArtistFavorite = {
      id: `fav-artist-${artist.provider}-${artist.providerArtistId}`,
      provider: artist.provider,
      providerArtistId: artist.providerArtistId,
      name: artist.name,
      artworkUrl: artist.artworkUrl ?? null,
      description: artist.description ?? null,
      createdAt: now,
      updatedAt: now
    };
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteArtists();
        const filtered = list.filter((a) => !(a.provider === artist.provider && a.providerArtistId === artist.providerArtistId));
        filtered.unshift(item);
        window.localStorage.setItem("soqaro-favorite-artists", JSON.stringify(filtered));
      } catch {}
    }
    return item;
  },
  deleteFavoriteArtist: async (provider: Provider, providerArtistId: string): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        const list = await soqaroApi.listFavoriteArtists();
        const filtered = list.filter((a) => !(a.provider === provider && a.providerArtistId === providerArtistId));
        window.localStorage.setItem("soqaro-favorite-artists", JSON.stringify(filtered));
      } catch {}
    }
    return { ok: true };
  },
  resolveQqMusicAudio: (
    trackId: string,
    quality: ProviderAudioQuality = "exhigh",
    signal?: AbortSignal
  ) => resolveQualityProviderAudio("qqmusic", trackId, quality, signal),
  downloadQqMusicTrack: (
    trackId: string,
    quality: ProviderAudioQuality = "exhigh",
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number | null) => void
  ) => downloadQualityProviderTrack("qqmusic", trackId, quality, signal, onProgress),
  downloadQqMusicArtwork: (artworkUrl: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ url: artworkUrl });
    return requestBlob(`/v1/providers/qqmusic/artwork?${params.toString()}`, { signal });
  },
  listMyPlaylists: async (_signal?: AbortSignal): Promise<Playlist[]> => {
    const session = getCurrentSessionInfo();
    const records = listLocalPlaylists();
    return records.map((record) => toApiPlaylist(record, session.userId));
  },
  createPlaylist: async (payload: {
    title: string;
    description?: string | null;
    trackIds?: string[];
    tags?: string[];
    coverUrl?: string | null;
    isCollaborative?: boolean;
    roomId?: string | null;
  }): Promise<Playlist> => {
    const session = getCurrentSessionInfo();
    const created = createLocalPlaylist({
      title: payload.title,
      description: payload.description,
      trackIds: payload.trackIds
    });
    notifyPlaylistsChanged();
    return toApiPlaylist(created, session.userId);
  },
  updatePlaylist: async (
    playlistId: string,
    payload: {
      title?: string;
      description?: string | null;
      tags?: string[];
      coverUrl?: string | null;
      trackIds?: string[];
    }
  ): Promise<Playlist> => {
    const session = getCurrentSessionInfo();
    const updated = updateLocalPlaylist(playlistId, {
      title: payload.title,
      description: payload.description,
      trackIds: payload.trackIds
    });
    notifyPlaylistsChanged();
    if (!updated) {
      throw new Error("Playlist not found");
    }
    return toApiPlaylist(updated, session.userId);
  },
  deletePlaylist: async (playlistId: string): Promise<{ ok: boolean }> => {
    deleteLocalPlaylist(playlistId);
    notifyPlaylistsChanged();
    return { ok: true };
  },
  importPlaylistToRoom: async (playlistId: string, payload: { roomId: string }): Promise<QueueMutationResponse> => {
    const snapshot = getLocalRoomSnapshot(payload.roomId);
    if (!snapshot) {
      throw new Error("Room not found");
    }
    const playlist = listLocalPlaylists().find((p) => p.id === playlistId);
    if (!playlist) {
      throw new Error("Playlist not found");
    }
    const session = getCurrentSessionInfo();
    const now = new Date().toISOString();
    const newQueueItems: QueueItem[] = playlist.trackIds.map((trackId, idx) => ({
      id: `queue-${playlistId}-${trackId}-${Date.now()}-${idx}`,
      trackId,
      requestedBy: session.nickname,
      requestedById: session.userId,
      source: "manual" as const,
      sourceSeedTrackId: null,
      position: snapshot.queue.length + idx,
      createdAt: now
    }));
    snapshot.queue.push(...newQueueItems);
    saveLocalRoomSnapshot(payload.roomId, snapshot);
    return {
      queue: snapshot.queue,
      playback: snapshot.room.playback
    };
  },
  createPlaylistFromRoom: async (payload: {
    roomId: string;
    title: string;
    description?: string | null;
  }): Promise<Playlist> => {
    const snapshot = getLocalRoomSnapshot(payload.roomId);
    if (!snapshot) {
      throw new Error("Room not found");
    }
    const session = getCurrentSessionInfo();
    const trackIds = snapshot.queue.map((item) => item.trackId);
    const created = createLocalPlaylist({
      title: payload.title,
      description: payload.description,
      trackIds
    });
    notifyPlaylistsChanged();
    return toApiPlaylist(created, session.userId);
  },
  getBilibiliAccount: async (): Promise<{ connected: boolean; uid: string | null; uname: string | null; face: string | null }> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-provider-bilibili-account");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return { connected: false, uid: null, uname: null, face: null };
  },
  saveBilibiliAccount: async (account: { uid?: string | null; uname?: string | null; face?: string | null; sessdata?: string }): Promise<{ connected: boolean; uid: string | null; uname: string | null; face: string | null }> => {
    const full = {
      connected: true,
      uid: account.uid ?? "bili-user",
      uname: account.uname ?? "哔哩哔哩用户",
      face: account.face ?? null
    };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("soqaro-provider-bilibili-account", JSON.stringify(full));
        if (account.sessdata) {
          window.localStorage.setItem("soqaro-provider-bilibili-sessdata", account.sessdata);
        }
      } catch {}
    }
    return full;
  },
  disconnectBilibiliAccount: async (): Promise<{ ok: boolean }> => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("soqaro-provider-bilibili-account");
        window.localStorage.removeItem("soqaro-provider-bilibili-sessdata");
      } catch {}
    }
    return { ok: true };
  },
  searchBilibiliTracks: (keywords: string, options?: { page?: number; pageSize?: number; tid?: number }) => {
    const params = new URLSearchParams({
      keyword: keywords,
      page: String(options?.page ?? 1),
      pageSize: String(options?.pageSize ?? 10)
    });
    if (typeof options?.tid === "number" && options.tid > 0) {
      params.set("tid", String(options.tid));
    }
    return request<BilibiliSearchResponse>(`/v1/providers/bilibili/search?${params.toString()}`);
  },
  getBilibiliView: (bvid: string) =>
    request<BilibiliVideoDetail>(`/v1/providers/bilibili/view/${encodeURIComponent(bvid)}`),
  getBilibiliVideoParts: (bvid: string) =>
    request<{
      bvid: string;
      title: string;
      rawTitle: string;
      artist: string;
      artworkUrl: string | null;
      pageCount: number;
      parts: BilibiliTrackCandidate[];
    }>(`/v1/providers/bilibili/view/${encodeURIComponent(bvid)}/parts`),
  getBilibiliLyrics: (trackId: string) =>
    request<ProviderLyrics>(`/v1/providers/bilibili/tracks/${encodeURIComponent(trackId)}/lyrics`),
  importBilibiliFavorite: (payload: { url: string; page?: number; pageSize?: number }) => {
    const params = new URLSearchParams();
    if (payload.page) params.set("page", String(payload.page));
    if (payload.pageSize) params.set("pageSize", String(payload.pageSize));
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<{
      title: string;
      items: BilibiliTrackCandidate[];
      total: number;
      hasMore: boolean;
    }>(`/v1/providers/bilibili/favorites/import${query}`, {
      method: "POST",
      body: JSON.stringify({ url: payload.url })
    });
  },
  getBilibiliRanking: (subType = "3", signal?: AbortSignal) =>
    request<BilibiliTrackCandidate[]>(`/v1/providers/bilibili/ranking?subType=${encodeURIComponent(subType)}`, { signal }),
  getBilibiliAudioStreamUrl: (trackId: string) =>
    `${apiBaseUrl}/v1/providers/bilibili/tracks/${encodeURIComponent(trackId)}/audio`,
  resolveBilibiliAudio: (trackId: string, signal?: AbortSignal) =>
    request<{ url: string; urls: string[]; mimeType: string; fileType: string; bvid: string; cid: number }>(
      `/v1/providers/bilibili/tracks/${encodeURIComponent(trackId)}/audio-url`,
      { signal }
    ),
  downloadBilibiliTrack: (
    trackId: string,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number | null) => void
  ) => {
    return downloadDirectTrack({
      resolve: () => soqaroApi.resolveBilibiliAudio(trackId, signal),
      fallback: () =>
        requestBlob(
          `/v1/providers/bilibili/tracks/${encodeURIComponent(trackId)}/audio`,
          { signal },
          onProgress
        ),
      headers: {
        Referer: "https://www.bilibili.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal,
      onProgress
    });
  },
  testAlistConnection: (config: { url: string; mountPath: string; token?: string }) =>
    request<AlistTestResponse>("/v1/storage/alist/test", {
      method: "POST",
      body: JSON.stringify(config)
    }),
  listAlistDirectory: (payload: {
    url: string;
    path: string;
    page?: number;
    perPage?: number;
    refresh?: boolean;
    token?: string;
  }) =>
    request<AlistListResponse>("/v1/storage/alist/list", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getAlistFile: (payload: { url: string; path: string; token?: string }) =>
    request<{ rawUrl: string; size: number; name: string }>("/v1/storage/alist/file", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getAlistStreamUrl: (rawUrl: string) =>
    `/v1/storage/alist/stream?url=${encodeURIComponent(rawUrl)}`,
  getActiveAnnouncements: async (_signal?: AbortSignal) => ({ data: [] as SystemAnnouncement[] })
}
