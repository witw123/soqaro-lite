import { describe, expect, it } from "vitest";
import { parsePlaylistUrlOrText } from "./playlist-url-parser";

describe("playlist-url-parser", () => {
  describe("NetEase Cloud Music", () => {
    it("parses web playlist link with hash", () => {
      const parsed = parsePlaylistUrlOrText("https://music.163.com/#/playlist?id=3778678");
      expect(parsed).toEqual({
        provider: "netease",
        type: "playlist",
        id: "3778678",
        originalInput: "https://music.163.com/#/playlist?id=3778678",
        cleanUrl: "https://music.163.com/#/playlist?id=3778678"
      });
    });

    it("parses direct playlist link without hash", () => {
      const parsed = parsePlaylistUrlOrText("https://music.163.com/playlist?id=24381616");
      expect(parsed).toMatchObject({
        provider: "netease",
        type: "playlist",
        id: "24381616"
      });
    });

    it("parses mobile shared text containing extra information", () => {
      const text = "分享网易云音乐歌单：【民谣精选】https://y.music.163.com/m/playlist?id=98765432&userid=123456 (@网易云音乐)";
      const parsed = parsePlaylistUrlOrText(text);
      expect(parsed).toMatchObject({
        provider: "netease",
        type: "playlist",
        id: "98765432"
      });
    });

    it("parses album and song links", () => {
      expect(parsePlaylistUrlOrText("https://music.163.com/#/album?id=12345")).toMatchObject({
        provider: "netease",
        type: "album",
        id: "12345"
      });
      expect(parsePlaylistUrlOrText("https://music.163.com/#/song?id=67890")).toMatchObject({
        provider: "netease",
        type: "track",
        id: "67890"
      });
    });
  });

  describe("QQ Music", () => {
    it("parses standard ryqq playlist link", () => {
      const parsed = parsePlaylistUrlOrText("https://y.qq.com/n/ryqq/playlist/7532321280");
      expect(parsed).toEqual({
        provider: "qqmusic",
        type: "playlist",
        id: "7532321280",
        originalInput: "https://y.qq.com/n/ryqq/playlist/7532321280",
        cleanUrl: "https://y.qq.com/n/ryqq/playlist/7532321280"
      });
    });

    it("parses legacy playsquare playlist link", () => {
      const parsed = parsePlaylistUrlOrText("https://y.qq.com/n/yqq/playsquare/1234567890.html");
      expect(parsed).toMatchObject({
        provider: "qqmusic",
        type: "playlist",
        id: "1234567890"
      });
    });

    it("parses mobile share taoge link with tracking parameters", () => {
      const text = "分享QQ音乐歌单: https://i.y.qq.com/n2/m/share/details/taoge.html?id=8234857412&channel=1";
      const parsed = parsePlaylistUrlOrText(text);
      expect(parsed).toMatchObject({
        provider: "qqmusic",
        type: "playlist",
        id: "8234857412"
      });
    });

    it("parses albumDetail and songDetail links", () => {
      expect(parsePlaylistUrlOrText("https://y.qq.com/n/ryqq/albumDetail/000abc")).toMatchObject({
        provider: "qqmusic",
        type: "album",
        id: "000abc"
      });
      expect(parsePlaylistUrlOrText("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYAx")).toMatchObject({
        provider: "qqmusic",
        type: "track",
        id: "0039MnYb0qxYAx"
      });
    });
  });

  describe("Bilibili", () => {
    it("parses medialist link", () => {
      const parsed = parsePlaylistUrlOrText("https://www.bilibili.com/medialist/play/ml12345678");
      expect(parsed).toMatchObject({
        provider: "bilibili",
        type: "playlist",
        id: "12345678"
      });
    });

    it("parses video BV link and raw BV string", () => {
      const parsed = parsePlaylistUrlOrText("https://www.bilibili.com/video/BV1xx411c7mD");
      expect(parsed).toMatchObject({
        provider: "bilibili",
        type: "track",
        id: "BV1xx411c7mD"
      });

      expect(parsePlaylistUrlOrText("BV1xx411c7mD")).toMatchObject({
        provider: "bilibili",
        type: "track",
        id: "BV1xx411c7mD"
      });
    });

    it("parses audio au link and raw au string", () => {
      expect(parsePlaylistUrlOrText("https://www.bilibili.com/audio/au123456")).toMatchObject({
        provider: "bilibili",
        type: "track",
        id: "123456"
      });
      expect(parsePlaylistUrlOrText("au123456")).toMatchObject({
        provider: "bilibili",
        type: "track",
        id: "123456"
      });
    });
  });

  describe("Invalid or empty input", () => {
    it("returns null for non-music string or empty input", () => {
      expect(parsePlaylistUrlOrText(null)).toBeNull();
      expect(parsePlaylistUrlOrText("")).toBeNull();
      expect(parsePlaylistUrlOrText("   ")).toBeNull();
      expect(parsePlaylistUrlOrText("https://example.com/other")).toBeNull();
    });
  });
});
