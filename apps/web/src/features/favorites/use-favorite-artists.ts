"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderArtistFavorite, ProviderArtistSummary } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";

export function useFavoriteArtists(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["favorite-artists", userId ?? "anonymous"];

  const query = useQuery<ProviderArtistFavorite[]>({
    queryKey,
    queryFn: () => soqaroApi.listFavoriteArtists(),
    enabled: Boolean(userId),
    staleTime: 60 * 1000
  });

  const saveMutation = useMutation({
    mutationFn: (artist: ProviderArtistSummary) => soqaroApi.saveFavoriteArtist(artist),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({ provider, providerArtistId }: { provider: ProviderArtistFavorite["provider"]; providerArtistId: string }) =>
      soqaroApi.deleteFavoriteArtist(provider as "netease" | "qqmusic", providerArtistId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  return {
    ...query,
    artists: query.data ?? [],
    saveFavoriteArtist: saveMutation.mutateAsync,
    deleteFavoriteArtist: deleteMutation.mutateAsync,
    isMutating: saveMutation.isPending || deleteMutation.isPending
  };
}
