import type { ProviderTrackCandidate } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";

let cachedProfile: Awaited<ReturnType<typeof soqaroApi.getPersonalizationProfile>> | null = null;
let profileExpiresAt = 0;
let pendingProfile: Promise<Awaited<ReturnType<typeof soqaroApi.getPersonalizationProfile>>> | null = null;

export async function rankSearchResultsWithPersonalization(tracks: ProviderTrackCandidate[]): Promise<ProviderTrackCandidate[]> {
  const profile = await getProfile().catch(() => null);
  if (!profile) return tracks;
  const trackScores = new Map(profile.topTracks.map((track) => [`${track.provider}:${track.providerTrackId}`, track.score]));
  const artistScores = new Map(profile.topArtists.map((artist) => [normalize(artist.name), artist.score]));
  return tracks.map((track, index) => ({
    track,
    index,
    score: (trackScores.get(`${track.provider}:${track.providerTrackId}`) ?? 0) * 0.7 + (artistScores.get(normalize(track.artist)) ?? 0) * 0.3
  })).sort((left, right) => right.score - left.score || left.index - right.index).map((item) => item.track);
}

async function getProfile() {
  if (cachedProfile && profileExpiresAt > Date.now()) return cachedProfile;
  pendingProfile ??= soqaroApi.getPersonalizationProfile().then((profile) => {
    cachedProfile = profile;
    profileExpiresAt = Date.now() + 5 * 60_000;
    return profile;
  }).finally(() => { pendingProfile = null; });
  return pendingProfile;
}

function normalize(value: string) { return value.normalize("NFKD").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, ""); }
