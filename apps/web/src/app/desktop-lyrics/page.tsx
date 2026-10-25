import type { Metadata } from "next";
import { DesktopLyricsWindowApp } from "@/components/desktop-lyrics/DesktopLyricsWindowApp";

export const metadata: Metadata = {
  title: "桌面歌词"
};


/**
 * Standalone host page for the Tauri desktop-lyrics window. The shell creates
 * an always-on-top transparent window pointing here; playback state arrives
 * over BroadcastChannel from the main window.
 */
export default function DesktopLyricsWindowPage() {
  return <DesktopLyricsWindowApp />;
}
