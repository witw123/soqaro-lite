"use client";

import { useQuery } from "@tanstack/react-query";
import type { NeteaseAccountStatus, QqMusicAccountStatus } from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";

type Provider = "netease" | "qqmusic";
type ProviderAccount = NeteaseAccountStatus | QqMusicAccountStatus;

export function useProviderAccount(
  userId: string | null | undefined,
  provider: Provider,
  enabled = true
) {
  return useQuery<ProviderAccount>({
    queryKey: ["provider-account", userId ?? "anonymous", provider],
    queryFn: () => (provider === "netease" ? soqaroApi.getNeteaseAccount() : soqaroApi.getQqMusicAccount()),
    enabled: Boolean(userId) && enabled && (provider === "netease" || provider === "qqmusic"),
    staleTime: 5 * 60 * 1000
  });
}
