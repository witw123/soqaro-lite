import type { Track, DiscoverPlaylistCard } from "./discover-types";
import { providerTrackKey } from "./discover-types";
import type { ProfileProviderRecommendations } from "@/features/discovery/profile-provider-recommendations";

export type DiscoverArtistItem = {
  artistName: string;
  representativeTrack: Track;
  artworkUrl: string | null;
  trackCount: number;
  reason: string;
};

export function extractDiscoverArtists(data: ProfileProviderRecommendations): DiscoverArtistItem[] {
  const map = new Map<string, DiscoverArtistItem>();
  const candidates = [...data.familiarArtists, ...data.forYou];
  for (const item of candidates) {
    const artist = item.candidate.artist?.trim();
    if (!artist) continue;
    if (!map.has(artist)) {
      map.set(artist, {
        artistName: artist,
        representativeTrack: item.candidate,
        artworkUrl: item.candidate.artworkUrl ?? null,
        trackCount: 1,
        reason: "艺人"
      });
    } else {
      map.get(artist)!.trackCount += 1;
    }
  }
  return Array.from(map.values()).slice(0, 8);
}

export const genreCategoryPresets = [
  { id: "rock", title: "摇滚精选", description: "经典与当下独立摇滚之声", tags: ["摇滚", "独立", "朋克"], keywords: ["摇滚", "rock", "朋克", "金属", "metal", "punk", "硬核"] },
  { id: "electronic", title: "电子律动", description: "House、Techno 与合成器节拍", tags: ["电子", "EDM", "律动"], keywords: ["电子", "edm", "house", "techno", "电音", "synth", "dance", "舞曲"] },
  { id: "focus", title: "专注纯音", description: "工作与深度思考的平静伴奏", tags: ["专注", "纯音", "轻音乐"], keywords: ["专注", "学习", "工作", "轻音乐", "纯音乐", "lo-fi", "chill", "白噪音", "钢琴", "古典"] },
  { id: "night", title: "深夜放空", description: "夜色中的慢调与柔和声音", tags: ["夜听", "深夜", "R&B"], keywords: ["夜听", "深夜", "夜晚", "晚安", "治愈", "r&b", "soul", "放空", "疗愈"] },
  { id: "acg", title: "ACG 精选", description: "动漫原声与日系流行曲目", tags: ["ACG", "动漫", "J-pop"], keywords: ["acg", "anime", "二次元", "动漫", "动画", "游戏", "vocaloid", "日系", "j-pop", "日语"] },
  { id: "guofeng", title: "国风雅韵", description: "民乐编曲与华语古韵", tags: ["国风", "古风", "仙侠"], keywords: ["国风", "古风", "仙侠", "华语", "戏腔", "新中式", "武侠"] },
  { id: "rnb", title: "R&B 都会", description: "现代 R&B 与 Soul 律动", tags: ["R&B", "都市", "律动"], keywords: ["r&b", "rnb", "soul", "嘻哈", "说唱", "hip-hop", "rap", "都市"] },
  { id: "folk", title: "民谣故事", description: "木吉他与质朴叙事之声", tags: ["民谣", "吉他", "故事"], keywords: ["民谣", "folk", "吉他", "不插电", "民乐"] }
];

export function buildCuratedPlaylistCards(data: ProfileProviderRecommendations): DiscoverPlaylistCard[] {
  const getArtistsExcerpt = (tracks: Track[]) => {
    const artists = Array.from(new Set(tracks.map((t) => t.artist).filter(Boolean))).slice(0, 3);
    return artists.length ? `${artists.join("、")} 等` : "精选代表曲目";
  };

  const familiarTracks = data.familiarArtists.map((i) => i.candidate);
  const deepTracks = data.deepCuts.map((i) => i.candidate);
  const moodTracks = data.moodDiscovery.map((i) => i.candidate);
  const forYouTracks = data.forYou.map((i) => i.candidate);

  const allPool = [
    ...(data.dailyRadar?.tracks ?? []),
    ...forYouTracks,
    ...moodTracks,
    ...deepTracks,
    ...familiarTracks
  ];
  const uniquePool = Array.from(
    new Map(allPool.map((t) => [providerTrackKey(t), t])).values()
  );

  const slowTracks = uniquePool.filter((track) => {
    const text = `${track.title} ${track.artist} ${track.album ?? ""} ${(track.tags ?? []).join(" ")}`.toLowerCase();
    return ["夜听", "深夜", "纯音乐", "轻音乐", "治愈", "r&b", "soul", "民谣", "lo-fi", "chill"].some((kw) => text.includes(kw));
  });

  const dailyMixes = [
    {
      id: "daily-mix-1",
      title: "Daily Mix 1",
      description: getArtistsExcerpt(familiarTracks.length ? familiarTracks : forYouTracks),
      tags: ["Daily Mix"],
      tracks: familiarTracks.length ? familiarTracks : forYouTracks
    },
    {
      id: "daily-mix-2",
      title: "Daily Mix 2",
      description: getArtistsExcerpt(deepTracks.length ? deepTracks : forYouTracks),
      tags: ["Daily Mix"],
      tracks: deepTracks.length ? deepTracks : forYouTracks
    },
    {
      id: "daily-mix-3",
      title: "Daily Mix 3",
      description: getArtistsExcerpt(moodTracks.length ? moodTracks : forYouTracks),
      tags: ["Daily Mix"],
      tracks: moodTracks.length ? moodTracks : forYouTracks
    },
    {
      id: "daily-mix-4",
      title: "Daily Mix 4",
      description: getArtistsExcerpt(slowTracks.length ? slowTracks : forYouTracks),
      tags: ["Daily Mix"],
      tracks: slowTracks.length ? slowTracks : forYouTracks
    }
  ];

  const dynamicGroups = genreCategoryPresets.flatMap((preset) => {
    const matched = uniquePool.filter((track) => {
      const text = `${track.title} ${track.artist} ${track.album ?? ""} ${(track.tags ?? []).join(" ")}`.toLowerCase();
      return (preset.keywords ?? []).some((kw) => text.includes(kw.toLowerCase()));
    });
    if (matched.length < 2) return [];
    return [{
      id: `genre-${preset.id}`,
      title: preset.title,
      description: preset.description,
      tags: preset.tags,
      tracks: matched
    }];
  });

  const allGroups = [...dailyMixes, ...dynamicGroups];

  return allGroups.flatMap(({ id, title, description, tags, tracks }) => {
    if (!tracks.length) return [];
    const firstTrack = tracks[0]!;
    return [{
      playlist: {
        provider: firstTrack.provider,
        providerPlaylistId: `soqaro-curated:${id}`,
        title,
        description,
        tags,
        artworkUrl: firstTrack.artworkUrl ?? null,
        creatorName: "Soqaro",
        trackCount: tracks.length
      },
      tracks,
      score: 100,
      reasons: ["推荐"]
    } satisfies DiscoverPlaylistCard];
  });
}
