import type {
  DailyRadarResponse,
  ProviderPlaylistSummary,
  ProviderTrackCandidate
} from "@soqaro/shared";
import { favoriteTrackToCandidate } from "@/features/favorites/use-favorite-tracks";
import { listMergedLocalPlaylistTracks } from "@/features/playlist/local-playlist";
import { soqaroApi } from "@/lib/network/soqaro-api";
import type {
  DiscoverPlaylistRecommendation,
  DiscoverTrackRecommendation,
  ProfileProviderRecommendations
} from "./profile-provider-recommendations";

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function candidateKey(candidate: ProviderTrackCandidate): string {
  return `${candidate.provider}:${candidate.providerTrackId}`;
}

function toTrackCandidate(record: {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  artworkUrl: string | null;
  provider: "netease" | "qqmusic" | "bilibili" | "alist" | "local_upload";
  providerTrackId: string | null;
}): ProviderTrackCandidate | null {
  const provider = record.provider;
  if (provider === "netease") {
    return {
      provider: "netease",
      providerTrackId: record.providerTrackId || record.id,
      access: "free",
      quality: "standard",
      title: record.title,
      artist: record.artist,
      album: record.album,
      durationMs: record.durationMs,
      artworkUrl: record.artworkUrl
    };
  }
  if (provider === "qqmusic") {
    return {
      provider: "qqmusic",
      providerTrackId: record.providerTrackId || record.id,
      access: "free",
      quality: "standard",
      title: record.title,
      artist: record.artist,
      album: record.album,
      durationMs: record.durationMs,
      artworkUrl: record.artworkUrl
    };
  }
  if (provider === "bilibili") {
    return {
      provider: "bilibili",
      providerTrackId: record.providerTrackId || record.id,
      access: "free",
      quality: "standard",
      title: record.title,
      artist: record.artist,
      album: record.album,
      durationMs: record.durationMs,
      artworkUrl: record.artworkUrl
    };
  }
  return null;
}

/**
 * 客户端本地个性化推荐与雷达生成引擎
 * 遵循项目宗旨：数据由本地获取与本地生成，服务端持久化存储
 */
export async function generateLocalDiscoveryRecommendations(input?: {
  signal?: AbortSignal;
}): Promise<ProfileProviderRecommendations> {
  if (input?.signal?.aborted) {
    throw new DOMException("Recommendation request aborted.", "AbortError");
  }

  // 1. 并发获取用户本地资产与持久化数据
  const [localRecords, favoriteTracks, myPlaylists, bilibiliRanking] = await Promise.all([
    listMergedLocalPlaylistTracks().catch(() => []),
    soqaroApi.listFavoriteTracks(input?.signal).catch(() => []),
    soqaroApi.listMyPlaylists(input?.signal).catch(() => []),
    // 客户端直接向开放公开榜单拉取新热补充
    soqaroApi.getBilibiliRanking("3", input?.signal).catch(() => [])
  ]);

  if (input?.signal?.aborted) {
    throw new DOMException("Recommendation request aborted.", "AbortError");
  }

  // 2. 汇集所有可用候选单曲
  const candidatePool: Map<string, { candidate: ProviderTrackCandidate; isFavorite: boolean; isLocal: boolean }> = new Map();

  for (const track of favoriteTracks) {
    const candidate = favoriteTrackToCandidate(track);
    const key = candidateKey(candidate);
    candidatePool.set(key, {
      candidate,
      isFavorite: true,
      isLocal: false
    });
  }

  for (const record of localRecords) {
    const candidate = toTrackCandidate(record);
    if (!candidate) continue;
    const key = candidateKey(candidate);
    const existing = candidatePool.get(key);
    if (existing) {
      existing.isLocal = true;
    } else {
      candidatePool.set(key, { candidate, isFavorite: false, isLocal: true });
    }
  }

  for (const biliTrack of bilibiliRanking) {
    const key = candidateKey(biliTrack);
    if (!candidatePool.has(key)) {
      candidatePool.set(key, { candidate: biliTrack, isFavorite: false, isLocal: false });
    }
  }

  const allCandidates = Array.from(candidatePool.values());

  // 3. 统计常听艺人频次
  const artistCounts = new Map<string, number>();
  for (const item of allCandidates) {
    const artist = normalizeText(item.candidate.artist);
    if (artist && artist !== "未知歌手" && artist !== "未知艺术家") {
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + (item.isFavorite ? 3 : 1));
    }
  }
  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  // 4. 生成各版块推荐
  const usedKeys = new Set<string>();

  // A. 猜你喜欢 (For You)
  const forYou: DiscoverTrackRecommendation[] = [];
  for (const item of allCandidates) {
    const key = candidateKey(item.candidate);
    if (usedKeys.has(key)) continue;
    const artistNorm = normalizeText(item.candidate.artist);
    const isTopArtist = topArtists.slice(0, 5).includes(artistNorm);

    let score = 0.5;
    const reasons: string[] = [];
    if (item.isFavorite) {
      score += 0.3;
      reasons.push("来自你的收藏");
    }
    if (isTopArtist) {
      score += 0.15;
      reasons.push("常听艺人");
    }
    if (item.isLocal) {
      score += 0.1;
      reasons.push("已在本地曲库");
    }
    if (reasons.length === 0) {
      reasons.push("热门精选");
    }

    forYou.push({
      candidate: item.candidate,
      source: item.isFavorite ? "library" : isTopArtist ? "artist" : "explore",
      score,
      reasons
    });
    usedKeys.add(key);
    if (forYou.length >= 12) break;
  }

  // B. 常听艺人 (Familiar Artists)
  const familiarArtists: DiscoverTrackRecommendation[] = [];
  const top5Artists = topArtists.slice(0, 5);
  if (top5Artists.length > 0) {
    for (const item of allCandidates) {
      const key = candidateKey(item.candidate);
      if (usedKeys.has(key)) continue;
      const artistNorm = normalizeText(item.candidate.artist);
      if (top5Artists.includes(artistNorm)) {
        familiarArtists.push({
          candidate: item.candidate,
          source: "artist",
          score: 0.85,
          reasons: ["常听艺人", item.candidate.artist]
        });
        usedKeys.add(key);
        if (familiarArtists.length >= 12) break;
      }
    }
  }

  // C. 探索发现 / 热门榜单 (Mood Discovery)
  const moodDiscovery: DiscoverTrackRecommendation[] = [];
  for (const biliTrack of bilibiliRanking) {
    const key = candidateKey(biliTrack);
    if (usedKeys.has(key)) continue;
    moodDiscovery.push({
      candidate: biliTrack,
      source: "explore",
      score: 0.75,
      reasons: ["B站精选", "热门探索"]
    });
    usedKeys.add(key);
    if (moodDiscovery.length >= 12) break;
  }

  // D. 深度好歌 / 重温经典 (Deep Cuts)
  const deepCuts: DiscoverTrackRecommendation[] = [];
  for (const item of allCandidates) {
    const key = candidateKey(item.candidate);
    if (usedKeys.has(key)) continue;
    if (item.isFavorite || item.isLocal) {
      deepCuts.push({
        candidate: item.candidate,
        source: "related",
        score: 0.7,
        reasons: ["经典重温", "宝藏曲目"]
      });
      usedKeys.add(key);
      if (deepCuts.length >= 12) break;
    }
  }

  // E. 精选歌单 (Playlists)
  const playlists: DiscoverPlaylistRecommendation[] = myPlaylists.slice(0, 8).map((pl) => ({
    playlist: {
      provider: "local",
      providerPlaylistId: pl.id,
      title: pl.title,
      description: pl.description,
      artworkUrl: pl.coverUrl,
      trackCount: pl.trackIds.length,
      creatorName: "我创建的歌单"
    } as unknown as ProviderPlaylistSummary,
    score: 0.9,
    reasons: ["我的歌单"]
  }));

  // F. 每日雷达 (Daily Radar)
  const todayStr = new Date().toISOString().slice(0, 10);
  const radarCandidates = allCandidates.slice(0, 15).map((item) => ({
    ...item.candidate,
    score: 0.88,
    reasons: ["今日雷达精选"]
  }));
  const dailyRadar: DailyRadarResponse | undefined = radarCandidates.length > 0 ? {
    date: todayStr,
    title: "今日私人雷达",
    subtitle: `基于本地收听与收藏生成的 ${todayStr} 专属聚焦`,
    tracks: radarCandidates,
    summaryGenres: ["流行", "探索", "本地精选"]
  } : undefined;

  return {
    providers: ["netease", "qqmusic"],
    forYou,
    familiarArtists,
    moodDiscovery,
    deepCuts,
    playlists,
    dailyRadar
  };
}
