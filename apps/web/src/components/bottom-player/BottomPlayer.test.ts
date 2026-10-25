import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BottomPlayer source", () => {
  it("keeps the local audio element non-autoplaying", () => {
    const source = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");

    expect(source).toContain("ref={audioRef}");
    expect(source).toContain("playsInline");
    expect(source).toContain('webkit-playsinline="true"');
    expect(source).not.toContain("autoPlay");
  });

  it("keeps the mobile footer height stable", () => {
    const source = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");
    const layoutSource = readFileSync(
      new URL("./bottom-player-layout.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("min-h-0");
    expect(layoutSource).toContain("h-12");
    expect(layoutSource).toContain("h-10 w-10");
  });

  it("restores the bottom-player volume action without adding it to the mini player", () => {
    const layoutSource = readFileSync(
      new URL("./bottom-player-layout.tsx", import.meta.url),
      "utf8"
    );
    const miniPlayerSource = readFileSync(
      new URL("./MiniPlayerOverlay.tsx", import.meta.url),
      "utf8"
    );

    expect(layoutSource).toContain("VolumeControl");
    expect(layoutSource).toContain("player-volume-button");
    expect(layoutSource).not.toContain("onInput={(event) => onChange");
    expect(layoutSource).not.toContain("onInput={(event) => applyVolume");
    expect(miniPlayerSource).not.toContain("VolumeIcon");
    expect(miniPlayerSource).not.toContain("音量");
    expect(miniPlayerSource).toContain("flex items-center justify-center gap-3");
  });

  it("does not let unrelated settings events overwrite the active volume", () => {
    const roomPlaybackSource = readFileSync(
      new URL("../../features/playback/use-room-playback.ts", import.meta.url),
      "utf8"
    );
    const localPlaybackSource = readFileSync(
      new URL("../../features/playback/local-player-context.tsx", import.meta.url),
      "utf8"
    );

    expect(roomPlaybackSource).toContain("lastSettingsDefaultVolumeRef.current !== settings.playback.defaultVolume");
    expect(localPlaybackSource).toContain("lastSettingsDefaultVolumeRef.current !== settings.playback.defaultVolume");
  });

  it("prioritizes the live display clock over the playback snapshot", () => {
    const source = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");

    expect(source).toContain("seekDraft ?? renderedProgressMs");
    expect(source).not.toContain("seekDraft ?? snapshotProgressMs ?? progressMs");
    expect(source).toContain("if (seekDraft === null)");
  });

  it("keeps the desktop scrubber pinned at the top edge and removes mobile hairline", () => {
    const layoutSource = readFileSync(new URL("./bottom-player-layout.tsx", import.meta.url), "utf8");
    const playerSource = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");

    expect(layoutSource).toContain("<TopEdgeScrubber");
    expect(playerSource).not.toContain("top-0 h-[2px]");
  });

  it("allows room-timeline seeking on the segmented source", () => {
    const playerSource = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");
    const controllerSource = readFileSync(
      new URL("./BottomPlayerController.tsx", import.meta.url),
      "utf8"
    );
    const layoutSource = readFileSync(
      new URL("./bottom-player-layout.tsx", import.meta.url),
      "utf8"
    );
    const shellSource = readFileSync(new URL("../room/RoomAppShell.tsx", import.meta.url), "utf8");
    const playbackSectionSource = readFileSync(
      new URL("../room/sections/RoomPlaybackSection.tsx", import.meta.url),
      "utf8"
    );

    expect(playbackSectionSource).toContain("canSeekPlayback={!isHostControlledRoom || isRoomHost}");
    expect(shellSource).not.toContain("activePlaybackSource");
    expect(controllerSource).toContain("canSeekPlayback={canSeekPlayback}");
    expect(controllerSource).toContain("hasRoomPermission(");
    expect(controllerSource).toContain('"player"');
    expect(playerSource).toContain("canSeekPlayback && canControlPlayback");
    expect(layoutSource).toContain("canSeek={canSeekPlayback}");
  });

  it("keeps transport controls available while cache playback is waiting", () => {
    const playerSource = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");
    const controllerSource = readFileSync(
      new URL("./BottomPlayerController.tsx", import.meta.url),
      "utf8"
    );

    expect(playerSource).toContain('const isPlaying = playback?.status === "playing";');
    expect(playerSource).toContain("const playerControlsEnabled = canControlPlayback;");
    expect(playerSource).not.toContain("canControlPlayback && !isPlaybackBarrierBlocked");
    expect(controllerSource).toContain("playbackBarrier?.holdPositionMs");
    expect(controllerSource).not.toContain("isPlaybackBarrierBlocked ? 0 : progressMs");
  });

  it("keeps the room mobile player above the mobile navigation layer", () => {
    const source = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");

    expect(source).toContain('bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[80]');
  });

  it("commits range seeking for pointer and keyboard interaction", () => {
    const layoutSource = readFileSync(
      new URL("./bottom-player-layout.tsx", import.meta.url),
      "utf8"
    );

    expect(layoutSource).toContain("onCommitSeek={commitSeek}");
    expect(layoutSource).toContain("onPointerUp={handlePointerUp}");
    expect(layoutSource).not.toContain("onMouseUp");
    expect(layoutSource).not.toContain("onTouchEnd");
  });

  it("exposes the mini player from both responsive player layouts", () => {
    const playerSource = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");
    const layoutSource = readFileSync(
      new URL("./bottom-player-layout.tsx", import.meta.url),
      "utf8"
    );
    const miniPlayerSource = readFileSync(
      new URL("./MiniPlayerOverlay.tsx", import.meta.url),
      "utf8"
    );
    const queueSource = readFileSync(new URL("./PlayerQueueDrawer.tsx", import.meta.url), "utf8");

    expect(playerSource).toContain("const [isMiniOpen, setIsMiniOpen] = useState(false)");
    expect(playerSource).toContain("<MiniPlayerOverlay");
    expect(layoutSource).toContain("<MiniPlayerToggleButton");
    expect(layoutSource).toContain('aria-label={isOpen ? "关闭迷你播放器" : "打开迷你播放器"}');
    expect(miniPlayerSource).toContain('data-testid="mini-player-overlay"');
    expect(miniPlayerSource).toContain('data-testid="mini-player-cover"');
    expect(miniPlayerSource).not.toContain("<MiniPlayButton");
    expect(miniPlayerSource).toContain("useArtworkPalette");
    expect(miniPlayerSource).toContain("backgroundColor: palette.surface");
    expect(miniPlayerSource).toContain("borderColor: palette.border");
    expect(miniPlayerSource).toContain("accentColor={palette.accent}");
    expect(miniPlayerSource).toContain("const coverBackdrop = artworkSource ? palette.accent : palette.background");
    expect(miniPlayerSource).not.toContain("miniPlayerColors");
    expect(miniPlayerSource).toContain("backgroundColor: coverBackdrop");
    expect(miniPlayerSource).toContain("left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] -translate-x-1/2");
    expect(miniPlayerSource).toContain("setPosition(null)");
    expect(miniPlayerSource).toContain("group-hover:opacity-100");
    expect(miniPlayerSource).toContain("group-focus-within:opacity-100");
    expect(miniPlayerSource).toContain("onPointerMove={handlePointerMove}");
    expect(miniPlayerSource).toContain("requestMiniPlayerWindow");
    expect(miniPlayerSource).toContain("createPortal(player, pipWindow.document.body)");
    expect(miniPlayerSource).toContain("!pipWindow ? (");
    expect(miniPlayerSource).toContain("h-full min-h-0 flex-col");
    expect(miniPlayerSource).not.toContain("overflow-y-auto");
    expect(miniPlayerSource).toContain("flex shrink-0 items-start justify-between");
    expect(miniPlayerSource).toContain("text-[1.25rem] font-bold");
    expect(miniPlayerSource).not.toContain("min-h-[84px]");
    expect(miniPlayerSource).not.toContain("sm:min-h-[104px]");
    expect(miniPlayerSource).toContain("pt-0 sm:px-2 sm:pb-3 sm:pt-0");
    expect(miniPlayerSource).toContain("const ownerWindow = pipWindow ?? window");
    expect(miniPlayerSource).toContain("panel.ownerDocument.defaultView ?? window");
    expect(queueSource).toContain("function QueueArtwork");
    expect(queueSource).toContain('data-testid="queue-item-artwork"');
    expect(queueSource).toContain("getArtworkSourceUrl");
    expect(queueSource).toContain("const albumName = track?.album?.trim() || \"未知专辑\"");
    expect(queueSource).toContain('data-testid="queue-item-next-button"');
    expect(queueSource).toContain('data-testid="queue-item-next-icon"');
    expect(queueSource).toContain('d="M6 18l8.5-6L6 6zm10-12v12h2V6z"');
    expect(queueSource).toContain('title="下一首播放"');
    expect(queueSource).toContain("onPlayNextQueueItem");
    expect(queueSource).not.toContain("function playNextQueueItem");
    expect(playerSource).toContain("requestMiniPlayerWindow()");
    expect(playerSource).toContain("pipWindow={miniPlayerWindow}");
  });

  it("hydrates the persistent player from local playlist metadata", () => {
    const localPlayerSource = readFileSync(
      new URL("../../features/playback/local-player-context.tsx", import.meta.url),
      "utf8"
    );

    expect(localPlayerSource).toContain("listMergedLocalPlaylistTracks");
    expect(localPlayerSource).toContain("const refreshLibraryRecords = useCallback");
    expect(localPlayerSource).toContain("mergeLocalTrackRecord");
    expect(localPlayerSource).toContain(
      "canControlPlayback: active && Boolean(currentRecord || queueRecords.length > 0 || libraryRecords.length > 0)"
    );
  });

  it("cascades roomId down to player layouts and queue drawers for asset recovery actions", () => {
    const playerSource = readFileSync(new URL("./BottomPlayer.tsx", import.meta.url), "utf8");
    const layoutSource = readFileSync(new URL("./bottom-player-layout.tsx", import.meta.url), "utf8");
    const immersiveSource = readFileSync(new URL("./ImmersivePlayerOverlay.tsx", import.meta.url), "utf8");
    const queueSource = readFileSync(new URL("./PlayerQueueDrawer.tsx", import.meta.url), "utf8");

    expect(playerSource).toContain("roomId?: string | null;");
    expect(playerSource).toContain("roomId={roomId}");
    expect(layoutSource).toContain("roomId?: string | null;");
    expect(layoutSource).toContain("roomId={roomId}");
    expect(immersiveSource).toContain("roomId?: string | null;");
    expect(immersiveSource).toContain("roomId={roomId}");
    expect(queueSource).toContain("roomId?: string | null;");
  });
});
