import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop lyrics integration", () => {
  it("connects both player sources to the shared lyrics provider", () => {
    const playerSource = readFileSync(new URL("../bottom-player/BottomPlayer.tsx", import.meta.url), "utf8");
    const controllerSource = readFileSync(new URL("../bottom-player/BottomPlayerController.tsx", import.meta.url), "utf8");
    const localPlayerSource = readFileSync(new URL("../bottom-player/AppPersistentPlayer.tsx", import.meta.url), "utf8");
    const runtimeSource = readFileSync(new URL("../shell/PersistentRoomRuntime.tsx", import.meta.url), "utf8");

    expect(playerSource).toContain("useDesktopLyricsRegistration");
    expect(controllerSource).toContain('desktopLyricsSource="room"');
    expect(localPlayerSource).toContain('desktopLyricsSource="local"');
    expect(runtimeSource).toContain("<DesktopLyricsProvider activeSource={owner}>");
    expect(runtimeSource).toContain("<DesktopLyricsOverlay />");
  });

  it("keeps lyrics controls outside the room stage and reuses provider lyric APIs", () => {
    const shellSource = readFileSync(new URL("../room/RoomAppShell.tsx", import.meta.url), "utf8");
    const stageSource = readFileSync(new URL("../room/RoomStage.tsx", import.meta.url), "utf8");
    const contextSource = readFileSync(new URL("../../features/playback/desktop-lyrics-context.tsx", import.meta.url), "utf8");

    expect(shellSource).not.toContain("isLyricsOpen");
    expect(shellSource).not.toContain("onToggleLyrics");
    expect(stageSource).not.toContain("isLyricsOpen");
    expect(contextSource).toContain("lyricRequestCache");
    expect(contextSource).toContain("fetchProviderLyricsCached");
  });

  it("renders the combined karaoke bar with transport and word-by-word fill", () => {
    const barSource = readFileSync(new URL("./DesktopLyricsBar.tsx", import.meta.url), "utf8");
    const contextSource = readFileSync(new URL("../../features/playback/desktop-lyrics-context.tsx", import.meta.url), "utf8");

    expect(barSource).toContain("上一首");
    expect(barSource).toContain("下一首");
    expect(barSource).toContain("关闭桌面歌词");
    expect(barSource).toContain("getRoomLyricWordProgress");
    expect(barSource).toContain("backgroundClip");
    expect(contextSource).toContain("wordSyncedLyric: lyrics.wordSyncedLyric");
    expect(barSource).toContain("wordSyncedLyric || plainLyric");
  });

  it("hosts the lyrics window for the Tauri shell and hides the in-page overlay there", () => {
    const overlaySource = readFileSync(new URL("./DesktopLyricsOverlay.tsx", import.meta.url), "utf8");
    const windowAppSource = readFileSync(new URL("./DesktopLyricsWindowApp.tsx", import.meta.url), "utf8");
    const contextSource = readFileSync(new URL("../../features/playback/desktop-lyrics-context.tsx", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("../../app/desktop-lyrics/page.tsx", import.meta.url), "utf8");
    const libSource = readFileSync(new URL("../../../../desktop/src-tauri/src/lib.rs", import.meta.url), "utf8");

    expect(overlaySource).toContain("isTauriRuntime()");
    expect(windowAppSource).toContain("DesktopLyricsBar");
    expect(windowAppSource).toContain("drag_desktop_lyrics_window");
    expect(pageSource).toContain("DesktopLyricsWindowApp");
    expect(contextSource).toContain("toggle_desktop_lyrics");
    expect(contextSource).toContain("soqaro-desktop-lyrics");
    expect(libSource).toContain("toggle_desktop_lyrics");
    expect(libSource).toContain("always_on_top(true)");
  });

  it("uses the Android system overlay for real on-screen lyrics on mobile", () => {
    const overlaySource = readFileSync(new URL("./DesktopLyricsOverlay.tsx", import.meta.url), "utf8");
    const contextSource = readFileSync(new URL("../../features/playback/desktop-lyrics-context.tsx", import.meta.url), "utf8");
    const tauriHelperSource = readFileSync(new URL("../../lib/desktop/tauri.ts", import.meta.url), "utf8");
    const pluginSource = readFileSync(
      new URL("../../../../mobile/android/app/src/main/java/com/soqaro/app/DesktopLyricsPlugin.java", import.meta.url),
      "utf8"
    );
    const manifestSource = readFileSync(
      new URL("../../../../mobile/android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8"
    );
    const mainActivitySource = readFileSync(
      new URL("../../../../mobile/android/app/src/main/java/com/soqaro/app/MainActivity.java", import.meta.url),
      "utf8"
    );

    expect(overlaySource).toContain("isCapacitorRuntime()");
    expect(contextSource).toContain("updatePlayback");
    expect(contextSource).toContain("updateLine");
    expect(tauriHelperSource).toContain("isCapacitorRuntime");
    expect(pluginSource).toContain("TYPE_APPLICATION_OVERLAY");
    expect(pluginSource).toContain("updateLine");
    expect(pluginSource).toContain("updatePlayback");
    expect(manifestSource).toContain("SYSTEM_ALERT_WINDOW");
    expect(mainActivitySource).toContain("registerPlugin(DesktopLyricsPlugin.class)");
  });
});
