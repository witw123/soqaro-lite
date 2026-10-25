import { describe, expect, it, vi } from "vitest";
import { checkAnyProviderAccountBound } from "./provider-account-guard";
import { soqaroApi } from "@/lib/network/soqaro-api";

describe("provider-account-guard", () => {
  it("returns bound: false when both netease and qqmusic are disconnected", async () => {
    vi.spyOn(soqaroApi, "getNeteaseAccount").mockResolvedValue({
      connected: false,
      neteaseUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    });
    vi.spyOn(soqaroApi, "getQqMusicAccount").mockResolvedValue({
      connected: false,
      qqMusicUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    });

    const status = await checkAnyProviderAccountBound();
    expect(status.bound).toBe(false);
    expect(status.neteaseConnected).toBe(false);
    expect(status.qqmusicConnected).toBe(false);
  });

  it("returns bound: true when netease is connected", async () => {
    vi.spyOn(soqaroApi, "getNeteaseAccount").mockResolvedValue({
      connected: true,
      neteaseUserId: "12345",
      nickname: "NeteaseUser",
      avatarUrl: null,
      lastValidatedAt: null
    });
    vi.spyOn(soqaroApi, "getQqMusicAccount").mockResolvedValue({
      connected: false,
      qqMusicUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    });

    const status = await checkAnyProviderAccountBound();
    expect(status.bound).toBe(true);
    expect(status.neteaseConnected).toBe(true);
    expect(status.qqmusicConnected).toBe(false);
  });

  it("returns bound: true when qqmusic is connected", async () => {
    vi.spyOn(soqaroApi, "getNeteaseAccount").mockResolvedValue({
      connected: false,
      neteaseUserId: null,
      nickname: null,
      avatarUrl: null,
      lastValidatedAt: null
    });
    vi.spyOn(soqaroApi, "getQqMusicAccount").mockResolvedValue({
      connected: true,
      qqMusicUserId: "qq_999",
      nickname: "QQUser",
      avatarUrl: null,
      lastValidatedAt: null
    });

    const status = await checkAnyProviderAccountBound();
    expect(status.bound).toBe(true);
    expect(status.neteaseConnected).toBe(false);
    expect(status.qqmusicConnected).toBe(true);
  });
});
