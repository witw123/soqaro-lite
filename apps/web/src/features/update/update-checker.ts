import { APP_VERSION } from "@soqaro/shared";
import { isCapacitorRuntime, isTauriRuntime, invokeTauri } from "@/lib/desktop/tauri";

export type ClientPlatform = "windows" | "macos" | "linux" | "android" | "web";
export type ClientRuntime = "desktop" | "mobile-native" | "web";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
}

export interface ReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: ReleaseAsset[];
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  release: ReleaseInfo;
  matchedAsset: ReleaseAsset | null;
  platform: ClientPlatform;
  runtime: ClientRuntime;
}

export function getCurrentAppVersion(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }
  return APP_VERSION;
}

/**
 * The version of the installed desktop shell when one is hosting this page.
 *
 * `getCurrentAppVersion()` reports the web bundle's build-time version, and the
 * Tauri window loads that bundle from a remote origin — so the value always
 * tracks the latest deploy and describes the *web*, never the binary the user
 * installed. Comparing it against the latest release can therefore only ever
 * answer "up to date", even for a desktop build several releases behind. Ask
 * the shell for its own compiled-in version and fall back only if it cannot
 * answer (plain browser, Capacitor shell, or a binary predating the command).
 */
export async function resolveCurrentAppVersion(): Promise<string> {
  if (isTauriRuntime()) {
    const shellVersion = await invokeTauri<string>("get_app_version");
    if (typeof shellVersion === "string" && shellVersion.trim()) {
      return shellVersion.trim();
    }
  }
  // Capacitor 安卓:APK 通过 server.url 加载远端 web,web 的构建版本
  // 永远等于服务器的而不是 APK 自身的;必须读原生 App 插件的 versionName。
  if (isCapacitorRuntime()) {
    try {
      const plugins = (window as unknown as {
        Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ version?: string }> } } };
      }).Capacitor?.Plugins;
      const info = await plugins?.App?.getInfo?.();
      if (info?.version && info.version.trim()) {
        return info.version.trim();
      }
    } catch {
      // 插件不可用时退回 web 版本
    }
  }
  return getCurrentAppVersion();
}

export function parseSemver(versionStr: string): [number, number, number] {
  const clean = versionStr.trim().replace(/^[vV]/, "");
  const [core] = clean.split("-");
  const parts = core.split(".").map((p) => {
    const num = parseInt(p, 10);
    return Number.isNaN(num) ? 0 : num;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const [rMaj, rMin, rPat] = parseSemver(remoteVersion);
  const [cMaj, cMin, cPat] = parseSemver(currentVersion);

  if (rMaj > cMaj) return true;
  if (rMaj < cMaj) return false;

  if (rMin > cMin) return true;
  if (rMin < cMin) return false;

  return rPat > cPat;
}

export function getClientRuntime(): ClientRuntime {
  if (isTauriRuntime()) return "desktop";
  if (isCapacitorRuntime()) return "mobile-native";
  return "web";
}

export function getClientPlatform(): ClientPlatform {
  if (isCapacitorRuntime()) return "android";

  if (typeof window !== "undefined" && window.navigator) {
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    if (ua.includes("mac") && !ua.includes("iphone") && !ua.includes("ipad")) return "macos";
    if (ua.includes("android")) return "android";
    if (ua.includes("linux")) return "linux";
  }

  return isTauriRuntime() ? "windows" : "web";
}

export function getPlatformDisplayName(platform: ClientPlatform, runtime: ClientRuntime): string {
  if (runtime === "web") return "Web 网页端";
  switch (platform) {
    case "windows":
      return "Windows 桌面端";
    case "macos":
      return "macOS 桌面端";
    case "linux":
      return "Linux 桌面端";
    case "android":
      return "Android 客户端";
    default:
      return "客户端";
  }
}

export function matchPlatformAsset(
  assets: ReleaseAsset[],
  platform: ClientPlatform
): ReleaseAsset | null {
  if (!assets || assets.length === 0) return null;

  switch (platform) {
    case "windows": {
      const exe = assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
      if (exe) return exe;
      return assets.find((a) => a.name.toLowerCase().endsWith(".msi")) ?? null;
    }
    case "macos": {
      const dmg = assets.find((a) => a.name.toLowerCase().endsWith(".dmg"));
      if (dmg) return dmg;
      return (
        assets.find(
          (a) => a.name.toLowerCase().endsWith(".app.tar.gz") || a.name.toLowerCase().endsWith(".tar.gz")
        ) ?? null
      );
    }
    case "linux": {
      const appImage = assets.find((a) => a.name.toLowerCase().endsWith(".appimage"));
      if (appImage) return appImage;
      const deb = assets.find((a) => a.name.toLowerCase().endsWith(".deb"));
      if (deb) return deb;
      return assets.find((a) => a.name.toLowerCase().endsWith(".rpm")) ?? null;
    }
    case "android": {
      return assets.find((a) => a.name.toLowerCase().endsWith(".apk")) ?? null;
    }
    case "web":
    default:
      return null;
  }
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  // First try local Next.js proxy route with caching
  try {
    const localRes = await fetch("/api/latest-release", { cache: "no-store" });
    if (localRes.ok) {
      const data = (await localRes.json()) as ReleaseInfo;
      if (data && data.tag_name) {
        return data;
      }
    }
  } catch {
    // Fall back to GitHub API
  }

  // Fallback direct request to GitHub
  try {
    const ghRes = await fetch("https://api.github.com/repos/witw123/soqaro-lite/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });

    if (ghRes.ok) {
      return (await ghRes.json()) as ReleaseInfo;
    }
  } catch {
    // Continue to redirect fallback below
  }

  // Fallback if GitHub API is unavailable or rate limited:
  try {
    const redirectRes = await fetch("https://github.com/witw123/soqaro-lite/releases/latest", {
      method: "HEAD",
      redirect: "manual"
    });
    const location = redirectRes.headers.get("location");
    if (location) {
      const match = location.match(/\/tag\/([^/?#]+)/);
      if (match) {
        const tagName = decodeURIComponent(match[1]);
        const version = tagName.replace(/^[vV]/, "");
        const releaseUrl = location.startsWith("http") ? location : `https://github.com${location}`;
        return {
          tag_name: tagName,
          name: tagName,
          published_at: new Date().toISOString(),
          html_url: releaseUrl,
          body: "通过 GitHub Releases 发布最新版本。",
          assets: [
            {
              name: `Soqaro Lite_${version}_x64-setup.exe`,
              browser_download_url: `https://github.com/witw123/soqaro-lite/releases/download/${tagName}/Soqaro Lite_${version}_x64-setup.exe`,
              size: 0
            },
            {
              name: `Soqaro Lite_${version}_universal.dmg`,
              browser_download_url: `https://github.com/witw123/soqaro-lite/releases/download/${tagName}/Soqaro Lite_${version}_universal.dmg`,
              size: 0
            },
            {
              name: `soqaro-lite_${version}_amd64.AppImage`,
              browser_download_url: `https://github.com/witw123/soqaro-lite/releases/download/${tagName}/soqaro-lite_${version}_amd64.AppImage`,
              size: 0
            },
            {
              name: `Soqaro-Lite-Android-${tagName}.apk`,
              browser_download_url: `https://github.com/witw123/soqaro-lite/releases/download/${tagName}/Soqaro-Lite-Android-${tagName}.apk`,
              size: 0
            }
          ]
        };
      }
    }
  } catch {
    // Final error
  }

  throw new Error("无法获取最新发布版本信息");
}

export async function checkForUpdates(currentVersionOverride?: string): Promise<UpdateCheckResult> {
  const currentVersion = currentVersionOverride || (await resolveCurrentAppVersion());
  const release = await fetchLatestRelease();
  const runtime = getClientRuntime();
  const platform = getClientPlatform();
  const latestVersion = release.tag_name.replace(/^[vV]/, "");
  const hasUpdate = isNewerVersion(latestVersion, currentVersion);
  const matchedAsset = matchPlatformAsset(release.assets, platform);

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    release,
    matchedAsset,
    platform,
    runtime
  };
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await invokeTauri("open_external_url", { url });
      return;
    } catch (error) {
      console.warn("[update] open_external_url via tauri failed, falling back:", error);
    }
  }

  if (typeof window !== "undefined") {
    if (isCapacitorRuntime()) {
      window.open(url, "_system");
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
