import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TrackDistributionBadge source structure", () => {
  const badgeSource = readFileSync(
    new URL("./TrackDistributionBadge.tsx", import.meta.url),
    "utf8"
  );

  it("renders a restrained 8px indicator dot adhering to design rules", () => {
    expect(badgeSource).toContain("h-2 w-2 rounded-full");
    expect(badgeSource).toContain("h-3.5 w-3.5");
    expect(badgeSource).toContain("absolute -bottom-0.5 -right-0.5");
  });

  it("handles disrupted asset states with specific titles and descriptions", () => {
    expect(badgeSource).toContain('"permission-denied"');
    expect(badgeSource).toContain('config.title = "权限受限"');
    expect(badgeSource).toContain('"asset-corrupt"');
    expect(badgeSource).toContain('config.title = "资产损坏"');
    expect(badgeSource).toContain('"source-missing"');
    expect(badgeSource).toContain('config.title = "音频源缺失"');
  });

  it("provides recovery action buttons only for the track owner when disrupted", () => {
    expect(badgeSource).toContain("const isOwner = Boolean(currentSessionId && currentSessionId === track.ownerSessionId);");
    expect(badgeSource).toContain('const canManageAsset = isOwner && (status.state === "source-missing" || status.state === "failed");');
    expect(badgeSource).toContain("canManageAsset && roomId");
    expect(badgeSource).toContain("重试准备");
    expect(badgeSource).toContain("选择本地文件");
    expect(badgeSource).toContain("ensureRoomTrackDistributionAsset(roomId, track)");
    expect(badgeSource).toContain("prepareTrackWithLocalFile(roomId, track, file)");
  });

  it("uses AnchoredDialog for popover details without cluttering the main UI", () => {
    expect(badgeSource).toContain("<AnchoredDialog");
    expect(badgeSource).toContain("ariaLabelledBy={`dist-badge-${track.id}`}");
  });
});
