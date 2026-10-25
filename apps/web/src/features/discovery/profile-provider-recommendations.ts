import type { ProviderPlaylistSummary, ProviderTrackCandidate } from "@soqaro/shared";
import { generateLocalDiscoveryRecommendations } from "./local-discover-engine";

export type DiscoverTrackRecommendation = {
  candidate: ProviderTrackCandidate;
  source: "library" | "related" | "artist" | "playlist" | "explore";
  score: number;
  reasons: string[];
};

export type DiscoverPlaylistRecommendation = {
  playlist: ProviderPlaylistSummary;
  score: number;
  reasons: string[];
};

export type ProfileProviderRecommendations = {
  providers: Array<"netease" | "qqmusic">;
  forYou: DiscoverTrackRecommendation[];
  familiarArtists: DiscoverTrackRecommendation[];
  moodDiscovery: DiscoverTrackRecommendation[];
  deepCuts: DiscoverTrackRecommendation[];
  playlists: DiscoverPlaylistRecommendation[];
  dailyRadar?: import("@soqaro/shared").DailyRadarResponse;
  liveRooms?: import("@soqaro/shared").LiveRoomRecommendation[];
};

export async function getProfileProviderRecommendations(input: {
  signal?: AbortSignal;
}): Promise<ProfileProviderRecommendations> {
  return generateLocalDiscoveryRecommendations(input);
}
