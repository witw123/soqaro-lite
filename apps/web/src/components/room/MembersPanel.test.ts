import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getMemberAudibleStatus,
  getPlaybackStatus,
  isMemberCurrentSource,
  resolveMemberMediaRates
} from "./MembersPanel";
import { createPeerSnapshot } from "@/features/p2p/diagnostics";

describe("MembersPanel WebRTC media status", () => {
  it("labels a non-source local file as local playback instead of speaking", () => {
    const audible = getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: true,
      isCurrentSource: false,
      localMemberState: {
        memberId: "member_1",
        audible: true,
        playbackPath: "local-file",
        playbackStatus: { label: "正常出声", detail: "", tone: "success", badgeText: "本地音频" }
      },
      diagnostic: undefined
    });

    expect(audible).toMatchObject({ label: "本地播放", active: true });
  });

  it("shows the local member as speaking only while local playback is audible", () => {
    const audible = getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: true,
      localMemberState: {
        memberId: "member_1",
        audible: true,
        playbackPath: "local-file",
        playbackStatus: { label: "正常出声", detail: "", tone: "success", badgeText: "RTP Opus" }
      },
      diagnostic: undefined
    });
    expect(audible).toMatchObject({ label: "正在发声", active: true });
  });

  it("labels a local listener receiving the source stream as playing", () => {
    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: true,
      isCurrentSource: false,
      localMemberState: {
        memberId: "member_1",
        audible: true,
        playbackPath: "remote-stream",
        playbackStatus: { label: "正常出声", detail: "", tone: "success", badgeText: "RTP Opus" }
      },
      diagnostic: undefined
    })).toMatchObject({ label: "正在播放", active: true });
  });

  it("uses the source session identity ahead of a stale peer id", () => {
    expect(isMemberCurrentSource({
      member: { id: "member_1", peerId: "peer_old" },
      sourceSessionId: "member_2",
      sourcePeerId: "peer_old"
    })).toBe(false);
    expect(isMemberCurrentSource({
      member: { id: "member_2", peerId: "peer_new" },
      sourceSessionId: "member_2",
      sourcePeerId: "peer_old"
    })).toBe(true);
  });

  it("labels a paused source as not speaking while listeners are not playing", () => {
    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: false,
      isLocal: true,
      isCurrentSource: true,
      localMemberState: null,
      diagnostic: undefined
    })).toMatchObject({ label: "未发声", active: false });
    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: false,
      isLocal: false,
      isCurrentSource: false,
      localMemberState: null,
      diagnostic: undefined
    })).toMatchObject({ label: "未播放", active: false });
  });

  it("uses a fresh remote self-report for the speaking indicator", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.reportedAudible = true;
    diagnostic.reportedAudibleAt = new Date().toISOString();

    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: false,
      localMemberState: null,
      diagnostic,
      now: Date.now()
    })).toMatchObject({ label: "正在发声", active: true });
  });

  it("does not claim a stale remote member is speaking", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.reportedAudible = true;
    diagnostic.reportedAudibleAt = new Date(Date.now() - 7_000).toISOString();

    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: false,
      localMemberState: null,
      diagnostic,
      now: Date.now()
    })).toMatchObject({ label: "等待音频", active: false });
  });

  it("keeps an unknown remote audio state from being reported as silent", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.reportedAudible = null;
    diagnostic.reportedAudibleAt = new Date().toISOString();

    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: false,
      localMemberState: null,
      diagnostic,
      now: Date.now()
    })).toMatchObject({ label: "等待音频", active: false });
  });

  it("uses a fresh remote receive aggregate for listener playback, not speaking", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.reportedReceiveRateKbps = 32;
    diagnostic.reportedAudible = null;
    diagnostic.reportedTelemetryAt = new Date().toISOString();

    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: false,
      isCurrentSource: false,
      localMemberState: null,
      diagnostic
    })).toMatchObject({ label: "正在播放", active: true });

    expect(getMemberAudibleStatus({
      presenceState: "online",
      playbackActive: true,
      isLocal: false,
      isCurrentSource: true,
      localMemberState: null,
      diagnostic
    })).toMatchObject({ label: "等待音频", active: false });
  });

  it("reports the actual current media track", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.mediaConnectionState = "connected";
    diagnostic.mediaReceiveBitrateKbps = 192;
    diagnostic.lastMediaStatsProgressAt = new Date().toISOString();

    expect(getPlaybackStatus("online", diagnostic, {
      playbackActive: true,
      isCurrentSource: true
    })).toMatchObject({
      label: "正常出声",
      tone: "success"
    });
  });

  it("does not claim remote sound output from transport diagnostics", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.dataChannelState = "open";

    diagnostic.mediaReceiveBitrateKbps = 192;
    diagnostic.lastMediaStatsProgressAt = new Date().toISOString();
    expect(getPlaybackStatus("online", diagnostic)).toMatchObject({
      label: "正常出声",
      detail: ""
    });
  });

  it("does not expect a remote non-source member to receive the room track", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.dataChannelState = "open";
    diagnostic.mediaConnectionState = "connected";
    diagnostic.mediaSendBitrateKbps = 184;
    diagnostic.lastMediaStatsProgressAt = new Date().toISOString();

    expect(getPlaybackStatus("online", diagnostic, {
      playbackActive: true,
      isCurrentSource: false
    })).toMatchObject({
      label: "连接正常",
      tone: "accent",
      badgeText: "连接正常"
    });
  });

  it("shows missing media data for the current source connection", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.mediaConnectionState = "connected";

    expect(getPlaybackStatus("online", diagnostic, {
      playbackActive: true,
      isCurrentSource: true
    })).toMatchObject({
      label: "音频准备中",
      tone: "warning"
    });
  });

  it("shows an ended media track as an audio failure until RTP returns", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.mediaConnectionState = "connected";
    diagnostic.mediaTrackState = "ended";

    expect(getPlaybackStatus("online", diagnostic, {
      playbackActive: true,
      isCurrentSource: true
    })).toMatchObject({
      label: "音频异常",
      tone: "danger"
    });
  });

  it("keeps the member view on the live RTP model", () => {
    const source = readFileSync(new URL("./MembersPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("mediaSummary");
    expect(source).not.toContain("playbackBitrateKbps");
    expect(source).not.toContain("transportSummary");
    expect(source).not.toContain("PCM");
    expect(source).not.toContain("legacy playback source");
    expect(source).not.toContain("完整本地缓存");
    expect(source).not.toContain("缓存播放链路");
    expect(source).not.toContain("预估满曲");
    expect(source).not.toContain("尚未建立");
  });

  it("keeps member rows focused on identity and host-only controls", () => {
    const source = readFileSync(new URL("./MembersPanel.tsx", import.meta.url), "utf8");
    const memberRows = source.slice(source.indexOf("function MembersPanelBase"));

    expect(source).toContain('data-testid="members-panel"');
    expect(source).toContain("member-settings-");
    expect(source).toContain("member-remove-");
    expect(source).toContain('role="switch"');
    expect(source).toContain("h-7 w-12");
    expect(source).toContain("left-1 top-1 h-5 w-5");
    expect(memberRows).not.toContain("reportedSendRateKbps");
    expect(memberRows).not.toContain("mediaConnectionState");
    expect(memberRows).toContain('isHost && member.role !== "host"');
  });

  it("prefers self-reported rates for remote members", () => {
    const source = readFileSync(new URL("./MembersPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain("reportedSendRateKbps");
    expect(source).toContain("reportedReceiveRateKbps");
    expect(source).toContain("resolveMemberMediaRates");
  });

  it("uses only remote self-reported aggregates for member rates", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.mediaSendBitrateKbps = 999;
    diagnostic.mediaReceiveBitrateKbps = 888;
    diagnostic.reportedSendRateKbps = 192;
    diagnostic.reportedReceiveRateKbps = 12;
    diagnostic.reportedTelemetryAt = new Date().toISOString();

    const rates = resolveMemberMediaRates({
      diagnostic,
      isLocal: false,
      localMemberState: null
    });
    expect(rates).toMatchObject({
      sendRateKbps: 192,
      receiveRateKbps: 12
    });
  });

  it("hides stale remote reported rates", () => {
    const diagnostic = createPeerSnapshot("peer_1", new Date().toISOString());
    diagnostic.reportedSendRateKbps = 192;
    diagnostic.reportedReceiveRateKbps = 12;
    diagnostic.reportedTelemetryAt = new Date(Date.now() - 10_000).toISOString();

    const rates = resolveMemberMediaRates({
      diagnostic,
      isLocal: false,
      localMemberState: null,
      now: Date.now()
    });
    expect(rates).toMatchObject({
      sendRateKbps: null,
      receiveRateKbps: null
    });
  });
});
