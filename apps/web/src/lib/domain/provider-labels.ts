/**
 * User-facing provider display names. Single source of truth — the same
 * ternary was copy-pasted across five components before this helper.
 */
export function providerDisplayName(
  provider: "netease" | "qqmusic" | "bilibili" | "alist" | string | null | undefined
): string {
  if (provider === "qqmusic") return "QQ 音乐";
  if (provider === "netease") return "网易云音乐";
  if (provider === "bilibili") return "哔哩哔哩";
  if (provider === "alist") return "Alist 网盘";
  return "网络歌单";
}
