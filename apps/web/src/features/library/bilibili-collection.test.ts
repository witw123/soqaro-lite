import { describe, expect, it } from "vitest";
import { isBilibiliCollection, bilibiliTrackToPlaylistSummary } from "./bilibili-collection";
import type { BilibiliTrackCandidate } from "@soqaro/shared";

describe("bilibili-collection helpers", () => {
  it("correctly identifies collections by pageCount, duration, or title keywords", () => {
    // Single track
    expect(isBilibiliCollection({
      title: "周杰伦 - 晴天 (Official Music Video)",
      durationMs: 269000,
      pageCount: 1,
      provider: "bilibili"
    })).toBe(false);

    // Multi-page
    expect(isBilibiliCollection({
      title: "周杰伦部分歌曲",
      durationMs: 200000,
      pageCount: 12,
      provider: "bilibili"
    })).toBe(true);

    // Long duration (over 10 minutes)
    expect(isBilibiliCollection({
      title: "车载音乐",
      durationMs: 720000,
      provider: "bilibili"
    })).toBe(true);

    // Title keyword matches
    expect(isBilibiliCollection({
      title: "【周杰伦】50首精选合集/后台播放/无损音质",
      durationMs: 300000,
      provider: "bilibili"
    })).toBe(true);

    expect(isBilibiliCollection({
      title: "原神枫丹OST全集",
      durationMs: 300000,
      provider: "bilibili"
    })).toBe(true);

    // Non-bilibili provider
    expect(isBilibiliCollection({
      title: "周杰伦精选合集",
      durationMs: 300000,
      provider: "netease"
    })).toBe(false);
  });

  it("converts a Bilibili track candidate to a ProviderPlaylistSummary", () => {
    const candidate: BilibiliTrackCandidate = {
      provider: "bilibili",
      providerTrackId: "BV123456",
      bvid: "BV123456",
      title: "【周杰伦】20首精选合集",
      artist: "周杰伦UP",
      album: null,
      durationMs: 1200000,
      artworkUrl: "https://example.com/pic.jpg",
      access: "free",
      quality: "exhigh",
      pageCount: 20
    };

    const summary = bilibiliTrackToPlaylistSummary(candidate);
    expect(summary.provider).toBe("bilibili");
    expect(summary.providerPlaylistId).toBe("BV123456");
    expect(summary.title).toBe("【周杰伦】20首精选合集");
    expect(summary.trackCount).toBe(20);
    expect(summary.tags).toContain("bilibili");
    expect(summary.tags).toContain("collection");
  });
});
