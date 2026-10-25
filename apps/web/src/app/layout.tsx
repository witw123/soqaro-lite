import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { PersistentRoomRuntime } from "@/components/shell";
import "./globals.css";

const themeInitScript = `(() => {
  try {
    const raw = localStorage.getItem("soqaro-settings-v1");
    const value = raw ? JSON.parse(raw) : null;
    const validThemes = ["system","dark","light","sage-dark","sage-light","obsidian","midnight-dark","midnight-light","paper"];
    const preference = value && validThemes.includes(value.theme) ? value.theme : "dark";
    const sidebarCollapsed = !(value && value.layout && value.layout.sidebarCollapsed === false);
    const systemPrefersLight = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
    let resolved = preference;
    if (resolved === "system") {
      resolved = systemPrefersLight ? "light" : "dark";
    }
    const isDark = resolved === "dark" || resolved === "sage-dark" || resolved === "obsidian" || resolved === "midnight-dark";
    const themeMode = isDark ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.dataset.sidebarCollapsed = String(sidebarCollapsed);
    document.documentElement.style.colorScheme = themeMode;

    const metaColors = {
      dark: "#0d0f12",
      light: "#f6f7f8",
      "sage-dark": "#141716",
      "sage-light": "#f2f5f3",
      obsidian: "#090a0c",
      "midnight-dark": "#0a0f18",
      "midnight-light": "#eef3f9",
      paper: "#f5f2eb"
    };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", metaColors[resolved] || (isDark ? "#0d0f12" : "#f6f7f8"));

    const isLyricsWindow = Boolean(typeof window !== "undefined" && window.location && (window.location.pathname === "/desktop-lyrics" || (window.location.search && window.location.search.indexOf("window=desktop-lyrics") !== -1)));
    if (isLyricsWindow) {
      document.documentElement.dataset.lyricsWindow = "true";
      document.documentElement.style.background = "transparent";
    }
    if (!isLyricsWindow && value && value.layout && typeof value.layout.uiScale === "number" && isFinite(value.layout.uiScale)) {
      const scale = Math.min(2, Math.max(0.5, value.layout.uiScale));
      if (Math.abs(scale - 1) >= 0.001) {
        const tauriInvoke =
          (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
          window.__TAURI_INTERNALS__?.invoke;
        if (tauriInvoke) {
          tauriInvoke("set_ui_zoom", { scale }).catch(function (error) {
            console.error("[ui-scale] Failed to set desktop zoom:", error);
          });
          document.documentElement.style.setProperty("--ui-scale", String(scale));
          document.documentElement.dataset.uiScale = String(scale);
        }
      }
    }
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeMode = "dark";
    document.documentElement.style.colorScheme = "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0d0f12");
  }
})();`;

export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover"
};

export const metadata: Metadata = {
  title: "Soqaro Lite",
  description: "本地多端 P2P 同步听歌工具，支持本地音乐库实时同步收听与无损音频协同。",
  keywords: ["Soqaro Lite", "音乐房", "一起听歌", "共享队列", "高保真音乐", "P2P 同步"],
  manifest: "/manifest.webmanifest",
  referrer: "no-referrer"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      data-theme-mode="dark"
      data-sidebar-collapsed="true"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <meta name="referrer" content="no-referrer" />
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <PersistentRoomRuntime>{children}</PersistentRoomRuntime>
      </body>
    </html>
  );
}
