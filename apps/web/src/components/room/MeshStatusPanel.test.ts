import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MeshStatusPanel.tsx", import.meta.url), "utf8");

describe("MeshStatusPanel WebRTC diagnostics", () => {
  it("shows unique connection details without repeating the member summary", () => {
    expect(source).toContain("连接诊断");
    expect(source).toContain("唯一诊断样本");
    expect(source).toContain("memberPlaybackStatus");
    expect(source).toContain("成员上行");
    expect(source).toContain("成员下行");
    expect(source).toContain("连接路径");
    expect(source).toContain("音频链路");
    expect(source).toContain("播放状态");
    expect(source).toContain("查看详情");
  });

  it("anchors card order to members and keeps a stable card structure", () => {
    expect(source).toContain("memberOrderRef");
    expect(source).toContain("key={member.id}");
    expect(source).not.toContain("min-h-[14rem]");
    expect(source).not.toContain("min-h-[10.75rem]");
    expect(source).toContain('peer={member.peerId ? diagnosticByPeerId.get(member.peerId) : undefined}');
    expect(source).toContain("hasConnectionDetails");
    expect(source).toContain("hasAudioMetrics");
    expect(source).toContain("hasPlaybackDetails");
  });

  it("does not render unsupported or empty diagnostic rows", () => {
    expect(source).not.toContain("音频上下文");
    expect(source).not.toContain("采样状态");
    expect(source).not.toContain("数据缓冲");
    expect(source).not.toContain("目标码率");
  });

  it("removes legacy playback and full-track cache values", () => {
    expect(source).not.toContain("PCM");
    expect(source).not.toContain("legacy playback source");
    expect(source).not.toContain("完整本地缓存");
    expect(source).not.toContain("缓存播放链路");
    expect(source).not.toContain("预估满曲");
    expect(source).not.toContain("尚未建立");
  });
});
