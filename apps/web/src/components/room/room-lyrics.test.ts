import { describe, expect, it } from "vitest";
import {
  alignRoomLyricLines,
  getActiveRoomLyricIndex,
  getRoomLyricDisplayWords,
  getRoomLyricWordProgress,
  hasWordSyncedRoomLyrics,
  parseRoomLyrics,
  selectRoomLyrics
} from "@/features/playback/lyrics";

describe("room lyrics", () => {
  it("aligns auxiliary lyrics by timestamp instead of array index", () => {
    const primary = parseRoomLyrics("[00:01]Original one\n[00:03]Original two");
    const auxiliary = parseRoomLyrics("[00:03]Translation two\n[00:01]Translation one");

    expect(alignRoomLyricLines(primary, auxiliary).map((line) => line?.text)).toEqual([
      "Translation one",
      "Translation two"
    ]);
  });

  it("parses LRC timestamps and ignores metadata tags", () => {
    const lines = parseRoomLyrics("[ti:Demo]\n[00:01.20]First\n[00:02]Second");

    expect(lines).toEqual([
      { id: "1:0", text: "First", timeMs: 1_200, words: [] },
      { id: "2:0", text: "Second", timeMs: 2_000, words: [] }
    ]);
  });

  it("parses YRC word timing", () => {
    expect(parseRoomLyrics("[1000,1200](1000,400,0)你(1400,600,0)好")).toEqual([
      {
        id: "0:yrc",
        text: "你好",
        timeMs: 1_000,
        words: [
          { text: "你", timeMs: 1_000, durationMs: 400 },
          { text: "好", timeMs: 1_400, durationMs: 600 }
        ]
      }
    ]);
  });

  it("unwraps QQ QRC XML lyric content", () => {
    const lyrics = '<Lyric_1 LyricType="1" LyricContent="[0,1000](0,500,0)逐(500,500,0)字&#10;[1000,500](1000,500,0)歌词"/>';

    expect(parseRoomLyrics(lyrics)).toEqual([
      {
        id: "0:yrc",
        text: "逐字",
        timeMs: 0,
        words: [
          { text: "逐", timeMs: 0, durationMs: 500 },
          { text: "字", timeMs: 500, durationMs: 500 }
        ]
      },
      {
        id: "1:yrc",
        text: "歌词",
        timeMs: 1_000,
        words: [
          { text: "歌", timeMs: 1_000, durationMs: 250 },
          { text: "词", timeMs: 1_250, durationMs: 250 }
        ]
      }
    ]);
  });

  it("normalizes line-relative QRC timing and splits it into characters", () => {
    expect(parseRoomLyrics("[1000,1000](0,1000,0)逐字")[0]?.words).toEqual([
      { text: "逐", timeMs: 1_000, durationMs: 500 },
      { text: "字", timeMs: 1_500, durationMs: 500 }
    ]);
  });

  it("builds smooth character-level display timing for plain line-synced lyrics", () => {
    const lines = parseRoomLyrics("[00:01.00]歌词\n[00:03.00]下一行");

    expect(getRoomLyricDisplayWords(lines, 0)).toEqual([
      { text: "歌", timeMs: 1_000, durationMs: 1_000 },
      { text: "词", timeMs: 2_000, durationMs: 1_000 }
    ]);
  });

  it("parses QRC suffix format text(start,dur)", () => {
    const lines = parseRoomLyrics("[1000,1000]背(1000,500)景(1500,500)");
    expect(lines[0]?.words).toEqual([
      { text: "背", timeMs: 1_000, durationMs: 500 },
      { text: "景", timeMs: 1_500, durationMs: 500 }
    ]);
  });

  it("parses Enhanced LRC format <mm:ss.xx>word", () => {
    const lines = parseRoomLyrics("[00:01.00]<00:01.00>hello <00:01.50>world");
    expect(lines[0]?.words).toEqual([
      { text: "hello ", timeMs: 1_000, durationMs: 500 },
      { text: "world", timeMs: 1_500, durationMs: 300 }
    ]);
  });

  it("handles anticipatory singing without exploding relative timeMs", () => {
    const lines = parseRoomLyrics("[10000,2000](9800,400,0)抢(10200,500,0)拍");
    expect(lines[0]?.words[0]?.timeMs).toBe(9_800);
  });

  it("prefers provider word-synced lyrics over stored line-synced lyrics", () => {
    const lineSynced = "[00:01.00]普通歌词";
    const wordSynced = "[1000,1000](1000,500,0)逐(1500,500,0)字";

    expect(hasWordSyncedRoomLyrics(lineSynced)).toBe(false);
    expect(selectRoomLyrics({
      localLyrics: lineSynced,
      wordSyncedLyric: wordSynced,
      plainLyric: lineSynced
    })).toBe(wordSynced);
  });

  it("replaces a stored QQ encrypted payload with provider lyrics", () => {
    const encryptedPayload = "0F3B54CF70B40B084246660B2D7067338AC33B27799529B6FB1C53A563027ABD66B5BED7887C293947839BD941016030459E";
    const plainLyric = "[00:00.00]三年二班";

    expect(selectRoomLyrics({
      localLyrics: encryptedPayload,
      plainLyric
    })).toBe(plainLyric);
  });

  it("calculates progressive fill within one word", () => {
    const word = { text: "歌词", timeMs: 1_000, durationMs: 400 };

    expect(getRoomLyricWordProgress(word, 900)).toBe(0);
    expect(getRoomLyricWordProgress(word, 1_200)).toBe(0.5);
    expect(getRoomLyricWordProgress(word, 1_500)).toBe(1);
  });

  it("finds the last lyric line reached by playback", () => {
    const lines = parseRoomLyrics("[00:01]First\n[00:03]Second");

    expect(getActiveRoomLyricIndex(lines, 0)).toBe(-1);
    expect(getActiveRoomLyricIndex(lines, 3_000)).toBe(1);
  });

  it("parses NetEase YRC JSON format metadata and song lines and discards raw JSON noise", () => {
    const yrc = `{"t":0,"c":[{"tx":"作词: "},{"tx":"娃娃","li":"http://example.com/artist.jpg"}]}
{"t":1000,"c":[{"tx":"作曲: "},{"tx":"陶喆"}]}
{"t":2000,"c":[{"tx":"编曲: "},{"tx":"吴庆隆"}]}
[10000,2000](10000,1000,0)歌(11000,1000,0)词
{"invalid":true}`;

    const lines = parseRoomLyrics(yrc);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual({
      id: "0:yrc-json",
      text: "作词: 娃娃",
      timeMs: 0,
      words: []
    });
    expect(lines[1]).toEqual({
      id: "1:yrc-json",
      text: "作曲: 陶喆",
      timeMs: 1_000,
      words: []
    });
    expect(lines[2]).toEqual({
      id: "2:yrc-json",
      text: "编曲: 吴庆隆",
      timeMs: 2_000,
      words: []
    });
    expect(lines[3]?.text).toBe("歌词");
    expect(lines.some((l) => l.text.includes("{"))).toBe(false);
  });

  it("detects word synced lyrics correctly", () => {
    expect(hasWordSyncedRoomLyrics("[1000,1200](1000,400,0)你(1400,600,0)好")).toBe(true);
    expect(hasWordSyncedRoomLyrics('<Lyric_1 LyricType="1" LyricContent="[0,1000](0,500,0)逐(500,500,0)字"/>')).toBe(true);
    expect(hasWordSyncedRoomLyrics("[00:01.00]普通歌词")).toBe(false);
    expect(hasWordSyncedRoomLyrics(null)).toBe(false);
  });

  it("prioritizes word-synced lyrics over plain lyrics when local lyrics are only plain", () => {
    const plainLocal = "[00:01.00]普通本地歌词";
    const wordSynced = "[1000,1200](1000,400,0)逐(1400,600,0)字";
    const plainRemote = "[00:01.00]远端普通歌词";

    expect(selectRoomLyrics({
      localLyrics: plainLocal,
      wordSyncedLyric: wordSynced,
      plainLyric: plainRemote
    })).toBe(wordSynced);
  });

  it("keeps local word-synced lyrics if already word-synced", () => {
    const wordSyncedLocal = "[1000,1200](1000,400,0)本(1400,600,0)地";
    const wordSyncedRemote = "[1000,1200](1000,400,0)远(1400,600,0)端";

    expect(selectRoomLyrics({
      localLyrics: wordSyncedLocal,
      wordSyncedLyric: wordSyncedRemote
    })).toBe(wordSyncedLocal);
  });
});
