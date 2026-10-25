import { soqaroApi } from "@/lib/network/soqaro-api";

export type ProviderBindingStatus = {
  bound: boolean;
  neteaseConnected: boolean;
  qqmusicConnected: boolean;
};

/**
 * Checks whether the current user has bound at least one music platform account (Netease or QQ Music).
 */
export async function checkAnyProviderAccountBound(): Promise<ProviderBindingStatus> {
  try {
    const [netease, qqmusic] = await Promise.allSettled([
      soqaroApi.getNeteaseAccount(),
      soqaroApi.getQqMusicAccount()
    ]);
    const neteaseConnected = netease.status === "fulfilled" && netease.value?.connected === true;
    const qqmusicConnected = qqmusic.status === "fulfilled" && qqmusic.value?.connected === true;
    return {
      bound: neteaseConnected || qqmusicConnected,
      neteaseConnected,
      qqmusicConnected
    };
  } catch {
    return {
      bound: false,
      neteaseConnected: false,
      qqmusicConnected: false
    };
  }
}
