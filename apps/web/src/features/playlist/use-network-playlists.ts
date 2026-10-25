"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Playlist } from "@soqaro/shared";
import { soqaroApi, playlistsChangedEventName } from "@/lib/network/soqaro-api";

export function useNetworkPlaylists(userId: string | null | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const userKey = userId ?? "anonymous";

  const query = useQuery<Playlist[]>({
    queryKey: ["network-playlists", userKey],
    queryFn: async ({ signal }) => {
      return soqaroApi.listMyPlaylists(signal);
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 30 * 1000
  });

  useEffect(() => {
    const handleChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ["network-playlists", userKey] });
    };
    window.addEventListener(playlistsChangedEventName, handleChanged);
    return () => window.removeEventListener(playlistsChangedEventName, handleChanged);
  }, [queryClient, userKey]);

  return {
    ...query,
    playlists: query.data ?? []
  };
}
