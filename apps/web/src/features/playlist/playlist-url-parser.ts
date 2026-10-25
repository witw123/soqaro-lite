export type PlaylistSourceProvider = "netease" | "qqmusic" | "bilibili";
export type PlaylistSourceType = "playlist" | "album" | "track";

export type ParsedPlaylistSource = {
  provider: PlaylistSourceProvider;
  type: PlaylistSourceType;
  id: string;
  originalInput: string;
  cleanUrl: string;
};

/**
 * Robustly parses third-party music URLs or user-shared multi-line texts (NetEase, QQ Music, Bilibili)
 * and extracts platform, source category (playlist / album / track), normalized ID, and canonical URL.
 */
export function parsePlaylistUrlOrText(input: string | null | undefined): ParsedPlaylistSource | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. NetEase Cloud Music (163)
  // Matches:
  // - https://music.163.com/#/playlist?id=123456
  // - https://music.163.com/playlist?id=123456
  // - https://y.music.163.com/m/playlist?id=123456
  // - https://music.163.com/playlist/123456
  // - https://music.163.com/#/album?id=123456
  const neteaseMatch = trimmed.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?music\.163\.com\/(?:#\/|m\/)?(playlist|album|song)(?:[/?]|.*?[?&]id=)([0-9]+)/i);
  if (neteaseMatch) {
    const rawType = neteaseMatch[1].toLowerCase();
    const type: PlaylistSourceType = rawType === "song" ? "track" : (rawType as PlaylistSourceType);
    const id = neteaseMatch[2];
    return {
      provider: "netease",
      type,
      id,
      originalInput: trimmed,
      cleanUrl: `https://music.163.com/#/${rawType}?id=${id}`
    };
  }

  // 2. QQ Music
  // Matches:
  // - https://y.qq.com/n/ryqq/playlist/7532321280
  // - https://y.qq.com/n/yqq/playsquare/7532321280.html
  // - https://i.y.qq.com/n2/m/share/details/taoge.html?id=7532321280
  const qqPlaylistMatch = trimmed.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?y\.qq\.com\/(?:n\/ryqq\/playlist\/|n\/yqq\/playsquare\/|n2\/m\/share\/details\/taoge\.html\?(?:.*&)?id=)([0-9]+)/i);
  if (qqPlaylistMatch) {
    const id = qqPlaylistMatch[1];
    return {
      provider: "qqmusic",
      type: "playlist",
      id,
      originalInput: trimmed,
      cleanUrl: `https://y.qq.com/n/ryqq/playlist/${id}`
    };
  }

  const qqAlbumMatch = trimmed.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?y\.qq\.com\/n\/ryqq\/albumDetail\/([a-zA-Z0-9]+)/i);
  if (qqAlbumMatch) {
    const id = qqAlbumMatch[1];
    return {
      provider: "qqmusic",
      type: "album",
      id,
      originalInput: trimmed,
      cleanUrl: `https://y.qq.com/n/ryqq/albumDetail/${id}`
    };
  }

  const qqSongMatch = trimmed.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?y\.qq\.com\/n\/ryqq\/songDetail\/([a-zA-Z0-9]+)/i);
  if (qqSongMatch) {
    const id = qqSongMatch[1];
    return {
      provider: "qqmusic",
      type: "track",
      id,
      originalInput: trimmed,
      cleanUrl: `https://y.qq.com/n/ryqq/songDetail/${id}`
    };
  }

  // 3. Bilibili
  // Matches:
  // - https://www.bilibili.com/medialist/play/ml12345 or ml12345
  // - https://www.bilibili.com/video/BV1xx411c7mD or BV1xx411c7mD
  // - https://www.bilibili.com/audio/au12345 or au12345
  const biliMediaListMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/medialist\/play\/(?:ml)?([0-9]+)/i) ||
                             trimmed.match(/^ml([0-9]+)$/i);
  if (biliMediaListMatch) {
    const id = biliMediaListMatch[1];
    return {
      provider: "bilibili",
      type: "playlist",
      id,
      originalInput: trimmed,
      cleanUrl: `https://www.bilibili.com/medialist/play/ml${id}`
    };
  }

  const biliVideoMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/i) ||
                         trimmed.match(/\b(BV[a-zA-Z0-9]{10})\b/);
  if (biliVideoMatch) {
    const id = biliVideoMatch[1];
    return {
      provider: "bilibili",
      type: "track",
      id,
      originalInput: trimmed,
      cleanUrl: `https://www.bilibili.com/video/${id}`
    };
  }

  const biliAudioMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/audio\/(?:au)?([0-9]+)/i) ||
                         trimmed.match(/\bau([0-9]+)\b/i);
  if (biliAudioMatch) {
    const id = biliAudioMatch[1];
    return {
      provider: "bilibili",
      type: "track",
      id,
      originalInput: trimmed,
      cleanUrl: `https://www.bilibili.com/audio/au${id}`
    };
  }

  return null;
}
