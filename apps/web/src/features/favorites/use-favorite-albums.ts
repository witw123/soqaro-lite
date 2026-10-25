"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderAlbumFavorite } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";

export function useFavoriteAlbums(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["favorite-albums", userId ?? "anonymous"];

  const query = useQuery<ProviderAlbumFavorite[]>({
    queryKey,
    queryFn: () => soqaroApi.listFavoriteAlbums(),
    enabled: Boolean(userId),
    staleTime: 60 * 1000
  });

  const saveMutation = useMutation({
    mutationFn: (album: Omit<ProviderAlbumFavorite, "id" | "createdAt" | "updatedAt">) =>
      soqaroApi.saveFavoriteAlbum(album),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({ provider, providerAlbumId }: { provider: ProviderAlbumFavorite["provider"]; providerAlbumId: string }) =>
      soqaroApi.deleteFavoriteAlbum(provider as "netease" | "qqmusic", providerAlbumId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  return {
    ...query,
    albums: query.data ?? [],
    saveFavoriteAlbum: saveMutation.mutateAsync,
    deleteFavoriteAlbum: deleteMutation.mutateAsync,
    isMutating: saveMutation.isPending || deleteMutation.isPending
  };
}
