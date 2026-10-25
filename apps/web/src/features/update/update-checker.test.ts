import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdates,
  formatFileSize,
  getCurrentAppVersion,
  isNewerVersion,
  matchPlatformAsset,
  parseSemver,
  resolveCurrentAppVersion,
  type ReleaseAsset
} from "./update-checker";

describe("update-checker", () => {
  describe("parseSemver", () => {
    it("parses standard versions", () => {
      expect(parseSemver("0.3.2")).toEqual([0, 3, 2]);
      expect(parseSemver("1.0.0")).toEqual([1, 0, 0]);
    });

    it("handles v prefix and pre-release tags", () => {
      expect(parseSemver("v0.3.3")).toEqual([0, 3, 3]);
      expect(parseSemver("V1.2.3-beta.1")).toEqual([1, 2, 3]);
    });

    it("handles missing parts gracefully", () => {
      expect(parseSemver("2")).toEqual([2, 0, 0]);
      expect(parseSemver("2.1")).toEqual([2, 1, 0]);
    });
  });

  describe("isNewerVersion", () => {
    it("identifies newer patch version", () => {
      expect(isNewerVersion("0.3.3", "0.3.2")).toBe(true);
      expect(isNewerVersion("v0.3.3", "0.3.2")).toBe(true);
    });

    it("identifies newer minor version", () => {
      expect(isNewerVersion("0.4.0", "0.3.2")).toBe(true);
    });

    it("identifies newer major version", () => {
      expect(isNewerVersion("1.0.0", "0.3.2")).toBe(true);
    });

    it("returns false for equal version", () => {
      expect(isNewerVersion("0.3.2", "0.3.2")).toBe(false);
      expect(isNewerVersion("v0.3.2", "0.3.2")).toBe(false);
    });

    it("returns false for older version", () => {
      expect(isNewerVersion("0.3.1", "0.3.2")).toBe(false);
      expect(isNewerVersion("0.2.9", "0.3.2")).toBe(false);
    });
  });

  describe("matchPlatformAsset", () => {
    const mockAssets: ReleaseAsset[] = [
      { name: "Music.Room_0.3.2_x64-setup.exe", browser_download_url: "https://example.com/setup.exe", size: 50000000 },
      { name: "Music.Room_0.3.2_x64_en-US.msi", browser_download_url: "https://example.com/app.msi", size: 51000000 },
      { name: "Music.Room_0.3.2_universal.dmg", browser_download_url: "https://example.com/app.dmg", size: 60000000 },
      { name: "Music.Room_universal.app.tar.gz", browser_download_url: "https://example.com/app.tar.gz", size: 59000000 },
      { name: "Music.Room_0.3.2_amd64.AppImage", browser_download_url: "https://example.com/app.AppImage", size: 70000000 },
      { name: "Music.Room_0.3.2_amd64.deb", browser_download_url: "https://example.com/app.deb", size: 68000000 },
      { name: "Music.Room-0.3.2-1.x86_64.rpm", browser_download_url: "https://example.com/app.rpm", size: 69000000 },
      { name: "Soqaro-Android-v1.0.0.apk", browser_download_url: "https://example.com/app.apk", size: 15000000 }
    ];

    it("matches Windows setup exe primarily", () => {
      const asset = matchPlatformAsset(mockAssets, "windows");
      expect(asset?.name).toBe("Music.Room_0.3.2_x64-setup.exe");
    });

    it("falls back to MSI if exe not present", () => {
      const noExe = mockAssets.filter((a) => !a.name.endsWith(".exe"));
      const asset = matchPlatformAsset(noExe, "windows");
      expect(asset?.name).toBe("Music.Room_0.3.2_x64_en-US.msi");
    });

    it("matches macOS DMG primarily", () => {
      const asset = matchPlatformAsset(mockAssets, "macos");
      expect(asset?.name).toBe("Music.Room_0.3.2_universal.dmg");
    });

    it("matches Linux AppImage primarily", () => {
      const asset = matchPlatformAsset(mockAssets, "linux");
      expect(asset?.name).toBe("Music.Room_0.3.2_amd64.AppImage");
    });

    it("falls back to deb for Linux if AppImage not present", () => {
      const noAppImage = mockAssets.filter((a) => !a.name.endsWith(".AppImage"));
      const asset = matchPlatformAsset(noAppImage, "linux");
      expect(asset?.name).toBe("Music.Room_0.3.2_amd64.deb");
    });

    it("matches Android APK", () => {
      const asset = matchPlatformAsset(mockAssets, "android");
      expect(asset?.name).toBe("Soqaro-Android-v1.0.0.apk");
    });

    it("returns null for web platform", () => {
      const asset = matchPlatformAsset(mockAssets, "web");
      expect(asset).toBeNull();
    });
  });

  describe("resolveCurrentAppVersion", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Host the page in a desktop shell whose version command answers `version`. */
    function stubDesktopShell(invoke?: (command: string) => Promise<unknown>) {
      vi.stubGlobal("window", {
        __TAURI_INTERNALS__: {},
        __TAURI__: invoke ? { core: { invoke } } : undefined
      });
    }

    it("returns the web bundle version in a plain browser", async () => {
      expect(await resolveCurrentAppVersion()).toBe(getCurrentAppVersion());
    });

    it("prefers the desktop shell's own version over the web bundle version", async () => {
      const invoke = vi.fn(async () => "0.3.2");
      stubDesktopShell(invoke);

      expect(await resolveCurrentAppVersion()).toBe("0.3.2");
      expect(invoke).toHaveBeenCalledWith("get_app_version", undefined);
    });

    it("trims the version the shell reports", async () => {
      stubDesktopShell(async () => " 0.3.4 \n");
      expect(await resolveCurrentAppVersion()).toBe("0.3.4");
    });

    it("falls back when the shell rejects the command", async () => {
      stubDesktopShell(async () => {
        throw new Error("command get_app_version not found");
      });
      expect(await resolveCurrentAppVersion()).toBe(getCurrentAppVersion());
    });

    it("falls back when the shell returns an empty version", async () => {
      stubDesktopShell(async () => "");
      expect(await resolveCurrentAppVersion()).toBe(getCurrentAppVersion());
    });

    it("falls back when the Tauri global exposes no invoke", async () => {
      stubDesktopShell(undefined);
      expect(await resolveCurrentAppVersion()).toBe(getCurrentAppVersion());
    });
  });

  describe("checkForUpdates", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function stubLatestRelease(tagName: string) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                tag_name: tagName,
                name: tagName,
                published_at: "2026-09-19T00:00:00Z",
                html_url: "https://example.com/release",
                body: "",
                assets: []
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
        )
      );
    }

    function stubDesktopShellVersion(version: string) {
      vi.stubGlobal("window", {
        __TAURI_INTERNALS__: {},
        __TAURI__: { core: { invoke: async () => version } }
      });
    }

    // Regression: the desktop window loads the web bundle remotely, so the
    // comparison must use the installed shell's version. Comparing the web
    // bundle's own version against the release made every desktop build look
    // up to date, including ones several releases behind.
    it("reports an update when the installed desktop shell trails the release", async () => {
      stubDesktopShellVersion("0.3.2");
      stubLatestRelease("v0.3.4");

      const result = await checkForUpdates();

      expect(result.currentVersion).toBe("0.3.2");
      expect(result.latestVersion).toBe("0.3.4");
      expect(result.hasUpdate).toBe(true);
    });

    it("reports no update when the installed desktop shell matches the release", async () => {
      stubDesktopShellVersion("0.3.4");
      stubLatestRelease("v0.3.4");

      const result = await checkForUpdates();

      expect(result.currentVersion).toBe("0.3.4");
      expect(result.hasUpdate).toBe(false);
    });

    it("still honors an explicit version override", async () => {
      stubDesktopShellVersion("0.3.4");
      stubLatestRelease("v0.3.4");

      const result = await checkForUpdates("0.3.2");

      expect(result.currentVersion).toBe("0.3.2");
      expect(result.hasUpdate).toBe(true);
    });
  });

  describe("formatFileSize", () => {
    it("formats bytes to MB accurately", () => {
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(52428800)).toBe("50.0 MB");
    });

    it("returns empty string for invalid or zero size", () => {
      expect(formatFileSize(0)).toBe("");
      expect(formatFileSize(-100)).toBe("");
    });
  });
});
