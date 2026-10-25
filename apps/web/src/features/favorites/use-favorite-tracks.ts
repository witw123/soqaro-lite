"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderTrackCandidate, ProviderTrackFavorite } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";
import { recordPersonalizationFavoriteCandidate } from "@/features/personalization/use-personalization-reporter";

function trackKey(track: Pick<ProviderTrackCandidate, "provider" | "providerTrackId">) {
  return `${track.provider}:${track.providerTrackId}`;
}

export function favoriteTrackToCandidate(track: ProviderTrackFavorite): ProviderTrackCandidate {
  return {
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    access: track.access,
    quality: track.quality,
    title: track.title,
    artist: track.artist,
    album: track.album,
    ...(track.providerAlbumId ? { providerAlbumId: track.providerAlbumId } : {}),
    durationMs: track.durationMs,
    artworkUrl: track.artworkUrl
  } as ProviderTrackCandidate;
}

export function useFavoriteTracks(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["favorite-tracks", userId ?? "anonymous"];
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const query = useQuery<ProviderTrackFavorite[]>({
    queryKey,
    queryFn: () => soqaroApi.listFavoriteTracks(),
    enabled: Boolean(userId),
    staleTime: 60 * 1000
  });

  const isFavorite = useCallback(
    (track: Pick<ProviderTrackCandidate, "provider" | "providerTrackId">) => {
      const tracks = query.data ?? [];
      const key = trackKey(track);
      return tracks.some((item) => trackKey(item) === key);
    },
    [query.data]
  );

  const toggleMutation = useMutation({
    mutationFn: async (track: ProviderTrackCandidate) => {
      const key = trackKey(track);
      setPendingKey(key);
      const currentList = queryClient.getQueryData<ProviderTrackFavorite[]>(queryKey) ?? [];
      const wasFavorite = currentList.some((item) => trackKey(item) === key);

      if (wasFavorite) {
        await soqaroApi.deleteFavoriteTrack(track.provider, track.providerTrackId);
      } else {
        await soqaroApi.saveFavoriteTrack(track);
      }
      return { track, wasFavorite };
    },
    onMutate: async (track) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ProviderTrackFavorite[]>(queryKey) ?? [];
      const key = trackKey(track);
      const wasFavorite = previous.some((item) => trackKey(item) === key);

      const optimisticList: ProviderTrackFavorite[] = wasFavorite
        ? previous.filter((item) => trackKey(item) !== key)
        : [
            {
              id: `pending:${key}`,
              ...track,
              providerAlbumId: track.providerAlbumId ?? null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            ...previous
          ];

      queryClient.setQueryData(queryKey, optimisticList);
      return { previous };
    },
    onError: (_err, _track, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: ({ track, wasFavorite }) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("soqaro-favorite-tracks-changed", {
            detail: {
              userId,
              track,
              isFavorite: !wasFavorite
            }
          })
        );
        void recordPersonalizationFavoriteCandidate(track, !wasFavorite).catch(() => undefined);
      }
    },
    onSettled: () => {
      setPendingKey(null);
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const toggleFavorite = useCallback(
    async (track: ProviderTrackCandidate) => {
      if (!userId) {
        throw new Error("请先登录项目账号后再收藏歌曲。");
      }
      await toggleMutation.mutateAsync(track);
    },
    [userId, toggleMutation]
  );

  return {
    favoriteTracks: query.data ?? [],
    isFavorite,
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : "歌曲收藏加载失败。") : null,
    pendingFavoriteKey: pendingKey,
    toggleFavorite
  };
}
