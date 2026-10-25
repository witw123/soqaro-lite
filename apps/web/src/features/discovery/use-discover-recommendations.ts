"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getProfileProviderRecommendations,
  type ProfileProviderRecommendations
} from "./profile-provider-recommendations";

export function useDiscoverRecommendations(
  userId: string | null | undefined,
  enabled = true
) {
  return useQuery<ProfileProviderRecommendations>({
    queryKey: ["discover", userId ?? "anonymous"],
    queryFn: ({ signal }) => getProfileProviderRecommendations({ signal }),
    enabled: Boolean(userId) && enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  });
}
