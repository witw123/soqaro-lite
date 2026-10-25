import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateTrackMatchScore,
  downloadTrackWithFallback,
  normalizeTrackSearchTerms,
  resolveFallbackSource
} from "./source-fallback-resolver";

const apiMocks = vi.hoisted(() => ({
  downloadNeteaseTrack: vi.fn(),
  downloadQqMusicTrack: vi.fn(),
  downloadBilibiliTrack: vi.fn(),
  searchNeteaseTracks: vi.fn(),
  searchQqMusicTracks: vi.fn(),
  searchBilibiliTracks: vi.fn()
}));

const settingsMocks = vi.hoisted(() => ({
  getAppSettings: vi.fn(() => ({
    playback: {
      enableFallbackSources: true,
      preferredAudioQuality: "exhigh"
    }
  }))
}));

vi.mock("@/lib/network/soqaro-api", () => ({
  soqaroApi: apiMocks
}));

vi.mock("@/features/settings/settings-store", () => settingsMocks);

describe("source-fallback-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeTrackSearchTerms", () => {
    it("strips common Live, Remix, and feat suffixes", () => {
      const terms1 = normalizeTrackSearchTerms("晴天 (Live)", "周杰伦");
      expect(terms1.cleanTitle).toBe("晴天");
      expect(terms1.cleanArtist).toBe("周杰伦");
      expect(terms1.query).toBe("晴天 周杰伦");

      const terms2 = normalizeTrackSearchTerms("夜曲（Remix）", "周杰伦 / 方文山");
      expect(terms2.cleanTitle).toBe("夜曲");
      expect(terms2.cleanArtist).toBe("周杰伦");

      const terms3 = normalizeTrackSearchTerms("See You Again (feat. Charlie Puth)", "Wiz Khalifa, Charlie Puth");
      expect(terms3.cleanTitle).toBe("See You Again");
      expect(terms3.cleanArtist).toBe("Wiz Khalifa");
    });
  });

  describe("calculateTrackMatchScore", () => {
    it("assigns high score to matching title, artist, and duration", () => {
      const score = calculateTrackMatchScore(
        { title: "七里香", artist: "周杰伦", durationMs: 299000 },
        { title: "七里香", artist: "周杰伦", durationMs: 300000 }
      );
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it("assigns 0 points to completely different tracks", () => {
      const score = calculateTrackMatchScore(
        { title: "七里香", artist: "周杰伦", durationMs: 300000 },
        { title: "青花瓷", artist: "周杰伦", durationMs: 300000 }
      );
      expect(score).toBe(0);
    });

    it("tolerates minor title brackets and artist joins", () => {
      const score = calculateTrackMatchScore(
        { title: "起风了 (Live)", artist: "买辣椒也用券" },
        { title: "起风了", artist: "买辣椒也用券" }
      );
      expect(score).toBeGreaterThanOrEqual(75);
    });
  });

  describe("resolveFallbackSource", () => {
    it("queries alternate provider when netease is current", async () => {
      apiMocks.searchQqMusicTracks.mockResolvedValueOnce({
        items: [
          {
            providerTrackId: "qq_123",
            title: "稻香",
            artist: "周杰伦",
            album: "魔杰座",
            durationMs: 223000,
            artworkUrl: "https://example.com/cover.jpg"
          }
        ]
      });

      const fallback = await resolveFallbackSource({
        title: "稻香",
        artist: "周杰伦",
        durationMs: 223000,
        currentProvider: "netease"
      });

      expect(fallback).not.toBeNull();
      expect(fallback?.provider).toBe("qqmusic");
      expect(fallback?.providerTrackId).toBe("qq_123");
      expect(fallback?.matchScore).toBeGreaterThanOrEqual(80);
      expect(apiMocks.searchQqMusicTracks).toHaveBeenCalledWith("稻香 周杰伦", { limit: 5 });
    });
  });

  describe("downloadTrackWithFallback", () => {
    const mockTrack = {
      provider: "netease" as const,
      providerTrackId: "ne_888",
      title: "枫",
      artist: "周杰伦",
      album: "十一月的萧邦",
      durationMs: 275000,
      artworkUrl: null,
      access: "free" as const,
      quality: "exhigh" as const
    };

    it("succeeds directly on primary provider without fallback", async () => {
      const dummyBlob = new Blob(["audio-data"], { type: "audio/mpeg" });
      apiMocks.downloadNeteaseTrack.mockResolvedValueOnce({
        blob: dummyBlob,
        contentType: "audio/mpeg"
      });

      const result = await downloadTrackWithFallback({ track: mockTrack });
      expect(result.isFallback).toBe(false);
      expect(result.actualTrack.provider).toBe("netease");
      expect(apiMocks.downloadNeteaseTrack).toHaveBeenCalledWith("ne_888", "exhigh", undefined);
      expect(apiMocks.searchQqMusicTracks).not.toHaveBeenCalled();
    });

    it("smoothly downloads from fallback provider when primary fails", async () => {
      apiMocks.downloadNeteaseTrack.mockRejectedValueOnce(new Error("VIP Required 403"));

      apiMocks.searchQqMusicTracks.mockResolvedValueOnce({
        items: [
          {
            providerTrackId: "qq_999",
            title: "枫",
            artist: "周杰伦",
            album: "十一月的萧邦",
            durationMs: 275000,
            artworkUrl: null
          }
        ]
      });

      const dummyFallbackBlob = new Blob(["fallback-audio"], { type: "audio/flac" });
      apiMocks.downloadQqMusicTrack.mockResolvedValueOnce({
        blob: dummyFallbackBlob,
        contentType: "audio/flac"
      });

      const result = await downloadTrackWithFallback({ track: mockTrack });
      expect(result.isFallback).toBe(true);
      expect(result.actualTrack.provider).toBe("qqmusic");
      expect(result.actualTrack.providerTrackId).toBe("qq_999");
      expect(apiMocks.downloadQqMusicTrack).toHaveBeenCalledWith("qq_999", "exhigh", undefined);
    });
  });
});
