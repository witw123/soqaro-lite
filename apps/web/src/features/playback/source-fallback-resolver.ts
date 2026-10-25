import type { AudioQualityPreference } from "@/features/settings/settings-store";
import { getAppSettings } from "@/features/settings/settings-store";
import { soqaroApi } from "@/lib/network/soqaro-api";
import type { ProviderTrack } from "@/features/playlist/local-playlist";

export type SupportedFallbackProvider = "netease" | "qqmusic" | "bilibili";

export type FallbackCandidate = {
  provider: SupportedFallbackProvider;
  providerTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  artworkUrl: string | null;
  matchScore: number;
};

/**
 * Strips common noise and suffixes like "(Live)", "(Remix)", "(feat. ...)", etc.
 * to produce clean keywords for cross-platform track matching.
 */
export function normalizeTrackSearchTerms(title: string, artist: string): { cleanTitle: string; cleanArtist: string; query: string } {
  const cleanTitle = title
    .replace(/[({[（【][^(){}[\]（）【】]*(live|remix|feat|ft\.|instrumental|伴奏|重制|cover|翻唱)[^(){}[\]（）【】]*[)}\]）】]/gi, "")
    .replace(/-\s*(live|remix|instrumental|伴奏|cover|翻唱)/gi, "")
    .replace(/[【】]/g, "")
    .trim() || title.trim();

  // Pick primary artist before comma, slash, or ampersand
  const cleanArtist = artist
    .split(/[/,&、]/)[0]
    .replace(/[({[（【].*[)}\]）】]/g, "")
    .trim() || artist.trim();

  return {
    cleanTitle,
    cleanArtist,
    query: `${cleanTitle} ${cleanArtist}`.trim()
  };
}

/**
 * Calculates a match score between 0 and 100 based on title, artist, and duration.
 */
export function calculateTrackMatchScore(
  target: { title: string; artist: string; durationMs?: number | null },
  candidate: { title: string; artist: string; durationMs?: number | null }
): number {
  let score = 0;
  const targetNormTitle = target.title.trim().toLowerCase();
  const candNormTitle = candidate.title.trim().toLowerCase();

  const targetTerms = normalizeTrackSearchTerms(target.title, target.artist);
  const candTerms = normalizeTrackSearchTerms(candidate.title, candidate.artist);

  // 1. Title Scoring (max 50 points)
  if (targetNormTitle === candNormTitle) {
    score += 50;
  } else if (targetTerms.cleanTitle.toLowerCase() === candTerms.cleanTitle.toLowerCase()) {
    score += 45;
  } else if (
    candNormTitle.includes(targetTerms.cleanTitle.toLowerCase()) ||
    targetNormTitle.includes(candTerms.cleanTitle.toLowerCase())
  ) {
    score += 30;
  } else {
    // If titles do not overlap at all, cannot match
    return 0;
  }

  // 2. Artist Scoring (max 30 points)
  const targetNormArtist = target.artist.trim().toLowerCase();
  const candNormArtist = candidate.artist.trim().toLowerCase();

  if (targetNormArtist === candNormArtist) {
    score += 30;
  } else if (
    targetTerms.cleanArtist.toLowerCase() === candTerms.cleanArtist.toLowerCase() ||
    candNormArtist.includes(targetTerms.cleanArtist.toLowerCase()) ||
    targetNormArtist.includes(candTerms.cleanArtist.toLowerCase())
  ) {
    score += 25;
  } else {
    // Artist differs completely
    score += 0;
  }

  // 3. Duration Scoring (max 20 points)
  if (
    typeof target.durationMs === "number" &&
    target.durationMs > 0 &&
    typeof candidate.durationMs === "number" &&
    candidate.durationMs > 0
  ) {
    const delta = Math.abs(target.durationMs - candidate.durationMs);
    if (delta <= 3000) {
      score += 20;
    } else if (delta <= 7000) {
      score += 15;
    } else if (delta <= 15000) {
      score += 8;
    }
  } else {
    // If duration unknown, give average duration points
    score += 10;
  }

  return score;
}

/**
 * Searches alternative providers to find an exact or high-confidence match for a song.
 */
export async function resolveFallbackSource(input: {
  title: string;
  artist: string;
  durationMs?: number | null;
  currentProvider?: string | null;
  signal?: AbortSignal;
}): Promise<FallbackCandidate | null> {
  const { title, artist, durationMs, currentProvider, signal } = input;
  const { query } = normalizeTrackSearchTerms(title, artist);

  // Prioritize other providers
  const candidateProviders: SupportedFallbackProvider[] =
    currentProvider === "netease"
      ? ["qqmusic", "bilibili"]
      : currentProvider === "qqmusic"
        ? ["netease", "bilibili"]
        : ["netease", "qqmusic"];

  for (const provider of candidateProviders) {
    if (signal?.aborted) break;

    try {
      let candidateList: Array<{
        providerTrackId: string;
        title: string;
        artist: string;
        album: string | null;
        durationMs: number;
        artworkUrl: string | null;
      }> = [];

      if (provider === "netease") {
        const res = await soqaroApi.searchNeteaseTracks(query, { limit: 5 });
        candidateList = (res.items || []).map((t) => ({
          providerTrackId: t.providerTrackId,
          title: t.title,
          artist: t.artist,
          album: t.album,
          durationMs: t.durationMs,
          artworkUrl: t.artworkUrl
        }));
      } else if (provider === "qqmusic") {
        const res = await soqaroApi.searchQqMusicTracks(query, { limit: 5 });
        candidateList = (res.items || []).map((t) => ({
          providerTrackId: t.providerTrackId,
          title: t.title,
          artist: t.artist,
          album: t.album,
          durationMs: t.durationMs,
          artworkUrl: t.artworkUrl
        }));
      } else if (provider === "bilibili") {
        const res = await soqaroApi.searchBilibiliTracks(query, { pageSize: 5 });
        candidateList = (res.items || []).map((t) => ({
          providerTrackId: t.providerTrackId,
          title: t.title,
          artist: t.artist,
          album: t.album ?? null,
          durationMs: t.durationMs,
          artworkUrl: t.artworkUrl ?? null
        }));
      }

      // Score candidates and pick highest scoring one
      let bestCandidate: FallbackCandidate | null = null;
      for (const cand of candidateList) {
        const matchScore = calculateTrackMatchScore(
          { title, artist, durationMs },
          cand
        );

        // Require at least 65 points out of 100 to prevent false-positives
        if (matchScore >= 65 && (!bestCandidate || matchScore > bestCandidate.matchScore)) {
          bestCandidate = {
            provider,
            providerTrackId: cand.providerTrackId,
            title: cand.title,
            artist: cand.artist,
            album: cand.album,
            durationMs: cand.durationMs,
            artworkUrl: cand.artworkUrl,
            matchScore
          };
        }
      }

      if (bestCandidate) {
        return bestCandidate;
      }
    } catch {
      // Continue to next alternative provider
    }
  }

  return null;
}

/**
 * Downloads a provider track, automatically attempting smart fallback from alternative platforms
 * if the primary provider download fails (e.g. VIP restriction, 403, or copyright unavailability).
 */
export async function downloadTrackWithFallback(input: {
  track: ProviderTrack;
  preferredQuality?: AudioQualityPreference;
  signal?: AbortSignal;
}): Promise<{
  response: { blob: Blob; contentType?: string };
  actualTrack: ProviderTrack;
  isFallback: boolean;
}> {
  const { track, preferredQuality, signal } = input;
  const settings = getAppSettings();
  const quality = preferredQuality ?? settings.playback.preferredAudioQuality;
  const allowFallback = settings.playback.enableFallbackSources !== false;

  const downloadDirect = async (prov: string, trackId: string) => {
    if (prov === "netease") {
      return soqaroApi.downloadNeteaseTrack(trackId, quality, signal);
    }
    if (prov === "qqmusic") {
      return soqaroApi.downloadQqMusicTrack(trackId, quality, signal);
    }
    return soqaroApi.downloadBilibiliTrack(trackId, signal);
  };

  // 1. Try Primary Download
  try {
    const res = await downloadDirect(track.provider, track.providerTrackId);
    return {
      response: res,
      actualTrack: track,
      isFallback: false
    };
  } catch (primaryErr) {
    if (signal?.aborted || !allowFallback) {
      throw primaryErr;
    }

    // 2. Try Smart Fallback Resolution
    const fallback = await resolveFallbackSource({
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      currentProvider: track.provider,
      signal
    });

    if (!fallback) {
      throw primaryErr;
    }

    // 3. Download from Fallback Provider
    try {
      const fallbackRes = await downloadDirect(fallback.provider, fallback.providerTrackId);
      const fallbackTrack: ProviderTrack = {
        ...track,
        provider: fallback.provider,
        providerTrackId: fallback.providerTrackId,
        album: fallback.album || track.album,
        artworkUrl: track.artworkUrl || fallback.artworkUrl
      } as ProviderTrack;

      return {
        response: fallbackRes,
        actualTrack: fallbackTrack,
        isFallback: true
      };
    } catch {
      // If fallback also fails, throw primary error
      throw primaryErr;
    }
  }
}
