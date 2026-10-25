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

function createLocalRoomSnapshot(
  roomId: string,
  joinCode: string,
  name: string = "本地房间",
  description: string | null = null,
  roomType: RoomType = "interactive",
  visibility: "public" | "private" = "public"
): RoomSnapshot {
  const now = new Date().toISOString();
  return {
    room: {
      id: roomId,
      hostId: "local-user",
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
          id: "local-user",
          nickname: "房主",
          role: "host",
          joinedAt: now,
          peerId: null,
          presenceState: "online"
        }
      ],
      directoryHostNickname: "房主",
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

export const soqaroApi = {
  getAuthConfig: () => request<AuthConfig>("/v1/auth/config"),
  me: async (): Promise<AuthSession> => ({
    id: "local-session",
    userId: "local-user",
    username: "soqaro_user",
    nickname: "本地用户",
    token: "local-token",
    createdAt: "2026-01-01T00:00:00.000Z"
  }),
  login: async (username: string, _password: string, _turnstileToken?: string): Promise<AuthSession> => ({
    id: "local-session",
    userId: "local-user",
    username: username || "soqaro_user",
    nickname: username || "本地用户",
    token: "local-token",
    createdAt: "2026-01-01T00:00:00.000Z"
  }),
  register: async (username: string, _password: string, nickname?: string, _turnstileToken?: string): Promise<AuthSession> => ({
    id: "local-session",
    userId: "local-user",
    username: username || "soqaro_user",
    nickname: nickname || username || "本地用户",
    token: "local-token",
    createdAt: "2026-01-01T00:00:00.000Z"
  }),
  logout: async () => ({ ok: true }),
  getPersonalizationProfile: (signal?: AbortSignal) =>
    request<PersonalizationProfileResponse>("/v1/personalization/profile", { signal }),
  recordPersonalizationEvent: (input: RecordPersonalizationEvent) =>
    request<{ ok: boolean }>("/v1/personalization/events", {
      method: "POST",
      body: JSON.stringify(input),
      keepalive: true
    }),
  getPersonalizationRecommendations: (input: PersonalizationRecommendationsQuery) => {
    const params = new URLSearchParams({ surface: input.surface });
    if (input.provider) params.set("provider", input.provider);
    if (input.currentTrackKey) params.set("currentTrackKey", input.currentTrackKey);
    if (input.query) params.set("query", input.query);
    if (input.excludedTrackKeys?.length) params.set("excludedTrackKeys", input.excludedTrackKeys.join(","));
    return request<PersonalizationRecommendationsResponse>(`/v1/personalization/recommendations?${params.toString()}`);
  },
  recordPersonalizationFeedback: (input: PersonalizationFeedback) =>
    request<{ ok: boolean }>("/v1/personalization/feedback", { method: "POST", body: JSON.stringify(input) }),
  listPersonalizationExclusions: (signal?: AbortSignal) =>
    request<PersonalizationExclusion[]>("/v1/personalization/exclusions", { signal }),
  removePersonalizationExclusion: (kind: "track" | "artist", key: string) =>
    request<{ ok: boolean }>(`/v1/personalization/exclusions/${kind}/${encodeURIComponent(key)}`, { method: "DELETE" }),
  getTrackRadio: (input: TrackRadioQuery) =>
    request<PersonalizationTrack[]>("/v1/personalization/radio", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  bootstrapColdStartProfile: (input: ColdStartTasteInput) =>
    request<{ ok: boolean }>("/v1/personalization/cold-start", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  clearPersonalizationProfile: () =>
    request<{ ok: boolean }>("/v1/personalization/profile", { method: "DELETE" }),
  createRoom: async (input: {
    visibility?: "private" | "public";
    roomType: RoomType;
    name?: string;
    description?: string | null;
    password?: string;
    newMemberPermissions?: RoomMemberPermissions;
  }): Promise<RoomSnapshot> => {
    const roomId = "room-" + Math.random().toString(36).slice(2, 9);
    const joinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const snapshot = createLocalRoomSnapshot(
      roomId,
      joinCode,
      input.name?.trim() || "本地房间",
      input.description?.trim() || null,
      input.roomType || "interactive",
      input.visibility || "public"
    );
    if (input.newMemberPermissions) {
      snapshot.room.newMemberPermissions = input.newMemberPermissions;
    }
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("soqaro-lite-rooms");
        const list: RoomDirectoryItem[] = raw ? JSON.parse(raw) : [];
        const item: RoomDirectoryItem = {
          room: {
            id: roomId,
            joinCode,
            name: snapshot.room.name ?? "本地房间",
            description: snapshot.room.description ?? null,
            hasPassword: false,
            visibility: snapshot.room.visibility,
            roomType: snapshot.room.roomType,
            directoryHostNickname: "房主",
            directoryMemberCount: 1,
            directoryOnlineMemberCount: 1,
            directoryIsMember: true,
            directoryQueueDepth: 0,
            directoryPendingRequestCount: 0,
            directoryBroadcastState: "off_air",
            directoryNowPlaying: null,
            playbackStatus: "paused"
          }
        };
        window.localStorage.setItem("soqaro-lite-rooms", JSON.stringify([item, ...list]));
        window.localStorage.setItem(`soqaro-room-${roomId}`, JSON.stringify(snapshot));
      } catch {}
    }
    return snapshot;
  },
  getRecentRoom: async (): Promise<RoomSnapshot | null> => null,
  getRecentRooms: async (): Promise<RoomSnapshot[]> => [],
  getRoomActivity: async (): Promise<RoomActivitySummary[]> => [],
  listOwnedRooms: async (): Promise<RoomSnapshot[]> => [],
  getRoomInteractionStats: async (): Promise<RoomInteractionStats> => ({
    sentLikes: 0,
    sentApplause: 0,
    receivedReactions: 0
  }),
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
    const code = joinCode.trim();
    const snapshot = createLocalRoomSnapshot(code, code, `房间 ${code}`);
    return {
      roomId: code,
      roomRevision: 1,
      room: snapshot.room
    };
  },
  joinRoom: async (roomId: string, _password?: string): Promise<RoomSnapshot> => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`soqaro-room-${roomId}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return createLocalRoomSnapshot(roomId, roomId, `房间 ${roomId}`);
  },
  getRoom: async (roomId: string): Promise<RoomSnapshot> => {
    return soqaroApi.joinRoom(roomId);
  },
  listRoomChatHistory: (roomId: string, before?: string) =>
    request<RoomChatHistoryResponse>(
      `/v1/rooms/${roomId}/chat${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  deleteRoomChatMessage: (roomId: string, messageId: string) =>
    request<{ roomId: string; messageId: string }>(`/v1/rooms/${roomId}/chat/${messageId}`, {
      method: "DELETE"
    }),
  syncRoom: (roomId: string, sinceRevision = 0) =>
    request<RoomSyncResponse>(`/v1/rooms/${roomId}/sync`, {
      headers: { "x-room-revision": String(Math.max(0, Math.floor(sinceRevision))) }
    }),
  updateRoom: (roomId: string, input: UpdateRoomRequest) =>
    request<RoomSnapshot>(`/v1/rooms/${roomId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  listRoomRequests: (roomId: string) => request<RoomRequest[]>(`/v1/rooms/${roomId}/requests`),
  createRoomRequest: (roomId: string, input: Omit<RoomRequest, "id" | "roomId" | "requesterId" | "requesterName" | "status" | "createdAt">) =>
    request<RoomRequest>(`/v1/rooms/${roomId}/requests`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  approveRoomRequest: (roomId: string, requestId: string) =>
    request<RoomRequest>(`/v1/rooms/${roomId}/requests/${requestId}/approve`, { method: "POST" }),
  rejectRoomRequest: (roomId: string, requestId: string) =>
    request<RoomRequest>(`/v1/rooms/${roomId}/requests/${requestId}/reject`, { method: "POST" }),
  getRoomReactionCounts: (roomId: string, trackId?: string | null) =>
    request<{ like: number; applause: number; fire?: number; sparkle?: number }>(`/v1/rooms/${roomId}/reactions${trackId ? `?trackId=${encodeURIComponent(trackId)}` : ""}`),
  updateRoomMemberPermissions: (
    roomId: string,
    memberId: string,
    permissions: RoomMemberPermissions
  ) =>
    request<RoomSnapshot>(`/v1/rooms/${roomId}/members/${memberId}/permissions`, {
      method: "PATCH",
      body: JSON.stringify({ permissions })
    }),
  removeRoomMember: (roomId: string, memberId: string) =>
    request<RoomSnapshot>(`/v1/rooms/${roomId}/members/${memberId}`, {
      method: "DELETE"
    }),
  leaveRoom: (roomId: string) =>
    request(`/v1/rooms/${roomId}/leave`, {
      method: "POST"
    }),
  deleteRoom: (roomId: string) =>
    request<{ ok: boolean }>(`/v1/rooms/${roomId}`, {
      method: "DELETE"
    }),
  registerTrack: (roomId: string, payload: object) =>
    request<TrackMeta>(`/v1/rooms/${roomId}/tracks`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  registerTracks: (roomId: string, payload: { tracks: object[] }) =>
    request<TrackMeta[]>(`/v1/rooms/${roomId}/tracks/batch`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  prepareTrackAsset: (roomId: string, trackId: string, payload: PrepareTrackAssetRequest) =>
    request<TrackMeta>(`/v1/rooms/${roomId}/tracks/${trackId}/asset`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  reportTrackAssetUnavailable: (roomId: string, trackId: string, payload: ReportTrackAssetUnavailableRequest) =>
    request<{ ok: boolean; trackId: string; reason: string }>(`/v1/rooms/${roomId}/tracks/${trackId}/asset/unavailable`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteTrack: (roomId: string, trackId: string) =>
    request<{ ok: boolean }>(`/v1/rooms/${roomId}/tracks/${trackId}`, {
      method: "DELETE"
    }),
  deleteTracks: (roomId: string, payload: { trackIds: string[] }) =>
    request<{ ok: boolean; deletedTrackIds: string[] }>(`/v1/rooms/${roomId}/tracks/batch-delete`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  reorderTracks: (roomId: string, payload: { trackIds: string[] }) =>
    request<TrackMeta[]>(`/v1/rooms/${roomId}/tracks/reorder`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  addQueueItem: (roomId: string, payload: { trackId: string }) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  addQueueItems: (roomId: string, payload: { trackIds: string[] }) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue/batch`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateRadioAutopilot: (roomId: string, payload: { enabled: boolean }) =>
    request<RoomSnapshot>(`/v1/rooms/${roomId}/radio-autopilot`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  insertRadioAutopilotNextTrack: (roomId: string, payload: { trackId: string }) =>
    request<RadioAutopilotNextTrackMutationResponse>(`/v1/rooms/${roomId}/radio-autopilot/next`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  reorderQueue: (roomId: string, payload: { queueItemIds: string[] }) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue/reorder`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  setNextQueueItem: (roomId: string, payload: { queueItemId: string }) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue/next`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  removeQueueItem: (roomId: string, queueItemId: string) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue/${queueItemId}`, {
      method: "DELETE"
    }),
  removeQueueItems: (roomId: string, payload: { queueItemIds: string[] }) =>
    request<QueueMutationResponse>(`/v1/rooms/${roomId}/queue/batch-remove`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updatePlayback: (
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
  ) =>
    request<PlaybackSnapshot>(`/v1/rooms/${roomId}/playback`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  getIceConfig: async (): Promise<IceConfigResponse> => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ],
    ttlSeconds: 86400,
    source: "stun-only"
  }),
  getNeteaseAccount: () =>
    request<NeteaseAccountStatus>("/v1/providers/netease/account"),
  startNeteaseQrLogin: () =>
    request<NeteaseQrStartResponse>("/v1/providers/netease/account/qr/start", {
      method: "POST"
    }),
  getNeteaseQrStatus: (attemptId: string) =>
    request<NeteaseQrStatusResponse>(
      `/v1/providers/netease/account/qr/${encodeURIComponent(attemptId)}/status`
    ),
  disconnectNeteaseAccount: () =>
    request<{ ok: boolean }>("/v1/providers/netease/account", {
      method: "DELETE"
    }),
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
  getQqMusicAccount: () => request<QqMusicAccountStatus>("/v1/providers/qqmusic/account"),
  startQqMusicQrLogin: () => request<QqMusicQrStartResponse>("/v1/providers/qqmusic/account/qr/start", { method: "POST" }),
  getQqMusicQrStatus: (attemptId: string) => request<QqMusicQrStatusResponse>(`/v1/providers/qqmusic/account/qr/${encodeURIComponent(attemptId)}/status`),
  disconnectQqMusicAccount: () => request<{ ok: boolean }>("/v1/providers/qqmusic/account", { method: "DELETE" }),
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
  listFavoriteAlbums: () => request<ProviderAlbumFavorite[]>("/v1/favorites/albums"),
  saveFavoriteAlbum: (album: Omit<ProviderAlbumFavorite, "id" | "createdAt" | "updatedAt">) =>
    request<ProviderAlbumFavorite>("/v1/favorites/albums", {
      method: "PUT",
      body: JSON.stringify(album)
    }),
  deleteFavoriteAlbum: (provider: Provider, providerAlbumId: string) =>
    request<{ ok: boolean }>(
      `/v1/favorites/albums/${provider}/${encodeURIComponent(providerAlbumId)}`,
      { method: "DELETE" }
    ),
  listFavoriteTracks: (signal?: AbortSignal) => request<ProviderTrackFavorite[]>("/v1/favorites/tracks", { signal }),
  saveFavoriteTrack: (track: ProviderTrackCandidate) =>
    request<ProviderTrackFavorite>("/v1/favorites/tracks", {
      method: "PUT",
      body: JSON.stringify(track)
    }),
  deleteFavoriteTrack: (provider: Provider, providerTrackId: string) =>
    request<{ ok: boolean }>(
      `/v1/favorites/tracks/${provider}/${encodeURIComponent(providerTrackId)}`,
      { method: "DELETE" }
    ),
  listFavoriteArtists: () => request<ProviderArtistFavorite[]>("/v1/favorites/artists"),
  saveFavoriteArtist: (artist: ProviderArtistSummary) =>
    request<ProviderArtistFavorite>("/v1/favorites/artists", {
      method: "PUT",
      body: JSON.stringify(artist)
    }),
  deleteFavoriteArtist: (provider: Provider, providerArtistId: string) =>
    request<{ ok: boolean }>(
      `/v1/favorites/artists/${provider}/${encodeURIComponent(providerArtistId)}`,
      { method: "DELETE" }
    ),
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
  listMyPlaylists: (signal?: AbortSignal) =>
    request<Playlist[]>("/v1/playlists", { signal }),
  createPlaylist: (payload: {
    title: string;
    description?: string | null;
    trackIds?: string[];
    tags?: string[];
    coverUrl?: string | null;
    isCollaborative?: boolean;
    roomId?: string | null;
  }) =>
    request<Playlist>("/v1/playlists", {
      method: "POST",
      body: JSON.stringify(payload)
    }).then((playlist) => {
      notifyPlaylistsChanged();
      return playlist;
    }),
  updatePlaylist: (
    playlistId: string,
    payload: {
      title?: string;
      description?: string | null;
      tags?: string[];
      coverUrl?: string | null;
      trackIds?: string[];
    }
  ) =>
    request<Playlist>(`/v1/playlists/${playlistId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }).then((playlist) => {
      notifyPlaylistsChanged();
      return playlist;
    }),
  deletePlaylist: (playlistId: string) =>
    request<{ ok: boolean }>(`/v1/playlists/${playlistId}`, {
      method: "DELETE"
    }).then((result) => {
      notifyPlaylistsChanged();
      return result;
    }),
  importPlaylistToRoom: (playlistId: string, payload: { roomId: string }) =>
    request<QueueMutationResponse>(`/v1/playlists/${playlistId}/import-to-room`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createPlaylistFromRoom: (payload: {
    roomId: string;
    title: string;
    description?: string | null;
  }) =>
    request<Playlist>("/v1/playlists/from-room", {
      method: "POST",
      body: JSON.stringify(payload)
    }).then((playlist) => {
      notifyPlaylistsChanged();
      return playlist;
    }),
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
