import type { ProviderTrackCandidate, RoomSnapshot } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";

export type RadioRecommendationCandidate = {
  candidate: ProviderTrackCandidate;
  lastFmMatch: number;
  providerMatchScore: number;
  recommendationScore: number;
  recommendationReasons: string[];
  existingRoomTrackId?: string;
};

export async function getRadioRecommendationCandidates(input: {
  userId: string;
  snapshot: RoomSnapshot;
  provider: "netease" | "qqmusic";
  seed: { title: string; artist: string };
}): Promise<RadioRecommendationCandidate[]> {
  const currentTrackId = input.snapshot.room.playback.currentTrackId;
  const currentTrack = currentTrackId
    ? input.snapshot.tracks.find((track) => track.id === currentTrackId) ?? null
    : null;
  const response = await soqaroApi.getPersonalizationRecommendations({
    surface: "radio",
    provider: input.provider,
    currentTrackKey: currentTrack?.sourceRef ? `${currentTrack.sourceRef.provider}:${currentTrack.sourceRef.trackId}` : undefined,
    excludedTrackKeys: input.snapshot.queue.flatMap((item) => {
      const track = input.snapshot.tracks.find((candidate) => candidate.id === item.trackId);
      return track?.sourceRef ? [`${track.sourceRef.provider}:${track.sourceRef.trackId}`] : [];
    })
  });
  const unique = new Map<string, RadioRecommendationCandidate>();
  for (const item of [...response.forYou, ...response.familiarArtists]) {
    const key = `${item.provider}:${item.providerTrackId}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      candidate: item,
      lastFmMatch: 0,
      providerMatchScore: item.score,
      recommendationScore: item.score,
      recommendationReasons: item.reasons
    });
  }
  return [...unique.values()];
}
