import type { BilibiliTrackCandidate, ProviderPlaylistSummary } from "@soqaro/shared";

/**
 * 判断 B 站条目是否为合集/分P/专辑集合（而非单曲）
 */
export function isBilibiliCollection(item: {
  title: string;
  provider?: string;
  durationMs?: number;
  pageCount?: number;
}): boolean {
  if (item.provider && item.provider !== "bilibili") return false;
  if (typeof item.pageCount === "number" && item.pageCount > 1) return true;
  // 单曲时长极少超过 10 分钟，超过 10 分钟的绝大多数为全集、多曲串烧、精选合集
  if (typeof item.durationMs === "number" && item.durationMs > 600000) return true;
  return /(?:全|\s)?(\d+)\s*[pP篇首集]|合集|精选|收录|全集|专辑|歌单|OST|BGM|串烧|连唱|Disc|Vol\./i.test(item.title);
}

/**
 * 将 B 站搜索候选中的合集转换为发现页标准的歌单摘要 (ProviderPlaylistSummary)
 */
export function bilibiliTrackToPlaylistSummary(track: BilibiliTrackCandidate): ProviderPlaylistSummary {
  const bvid = track.bvid || track.providerTrackId.split(":")[0];
  let count = track.pageCount && track.pageCount > 1 ? track.pageCount : 1;
  const pMatch = track.title.match(/(?:全|\s)?(\d+)\s*[pP篇首集]/i);
  if (pMatch && pMatch[1]) {
    const parsed = parseInt(pMatch[1], 10);
    if (parsed > 1 && parsed < 1000) count = parsed;
  }

  return {
    provider: "bilibili",
    providerPlaylistId: bvid,
    title: track.title,
    description: track.artist,
    tags: ["bilibili", "collection"],
    artworkUrl: track.artworkUrl,
    creatorName: track.artist,
    trackCount: count
  };
}
