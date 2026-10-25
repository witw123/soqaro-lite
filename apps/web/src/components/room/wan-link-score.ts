import type { PeerDiagnosticsSnapshot } from "@soqaro/shared";
import {
  resolvePeerLinkProfile,
  type PeerLinkProfile,
  type PeerLinkProfileInput
} from "@/features/p2p/peer-link-profile";
import { formatTransferRateMBps } from "@/lib/domain/soqaro-ui";

export type WanLinkTone = "neutral" | "success" | "warning" | "danger" | "accent";

export type WanProviderSummary = {
  peerId: string;
  nickname?: string | null;
  availableUnits: number;
  totalUnits: number;
  isPreferredSource?: boolean;
};

export type WanMediaDirection = "send" | "receive" | "unknown";
export type WanMediaTrackState = "none" | "live" | "ended" | "failed";

export type WanLinkScoreInput = {
  candidateType?: string | null;
  protocol?: string | null;
  relayProtocol?: string | null;
  rttMs?: number | null;
  downloadRateKbps?: number | null;
  uploadRateKbps?: number | null;
  playbackBitrateKbps?: number | null;
  mediaDirection?: WanMediaDirection;
  mediaTrackState?: WanMediaTrackState | null;
  mediaConnectionState?: string | null;
  packetLossRate?: number | null;
  jitterMs?: number | null;
  sampleAgeMs?: number | null;
  transportScore?: "healthy" | "degraded" | "unstable" | "failed" | null;
  dataChannelState?: string | null;
  bufferedAmountBytes?: number | null;
  providers?: WanProviderSummary[];
};

export type WanLinkScore = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  tone: WanLinkTone;
  profile: PeerLinkProfile;
  pathLabel: string;
  summary: string;
  metrics: {
    rttLabel: string;
    downloadLabel: string;
    uploadLabel: string;
    providerLabel: string;
    audioBitrateLabel: string;
    headroomLabel: string;
    packetLossLabel: string;
    jitterLabel: string;
    directionLabel: string;
    sampleAgeLabel: string;
  };
  tips: string[];
};

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveWanPathLabel(input: {
  candidateType?: string | null;
  protocol?: string | null;
  relayProtocol?: string | null;
  profile: PeerLinkProfile;
}) {
  const candidate = input.candidateType?.trim() || "unknown";
  const protocol =
    input.relayProtocol?.trim() ||
    input.protocol?.trim() ||
    (input.profile === "relay-udp" ? "udp" : "unknown");
  const kind =
    input.profile === "relay-udp" || candidate === "relay"
      ? "中继"
      : "直连";
  return `${kind} (${candidate}/${protocol})`;
}

function scoreFromProfile(profile: PeerLinkProfile) {
  switch (profile) {
    case "fast-direct": return 20;
    case "standard-direct": return 17;
    case "relay-udp": return 14;
    case "constrained": return 7;
    case "severe": return 0;
  }
}

function scoreFromRtt(rttMs: number | null) {
  if (rttMs === null) return 8;
  if (rttMs <= 40) return 15;
  if (rttMs <= 80) return 13;
  if (rttMs <= 120) return 11;
  if (rttMs <= 200) return 8;
  if (rttMs <= 320) return 5;
  if (rttMs <= 500) return 2;
  return 0;
}

function scoreFromThroughput(downloadRateKbps: number | null, playbackBitrateKbps: number | null) {
  if (downloadRateKbps === null || playbackBitrateKbps === null) return 10;
  const ratio = downloadRateKbps / playbackBitrateKbps;
  if (ratio >= 2) return 20;
  if (ratio >= 1.5) return 18;
  if (ratio >= 1.25) return 16;
  if (ratio >= 1) return 13;
  if (ratio >= 0.75) return 9;
  if (ratio >= 0.5) return 5;
  if (ratio <= 0) return 0;
  return 2;
}

function scoreFromPacketLoss(packetLossRate: number | null) {
  if (packetLossRate === null) return 15;
  if (packetLossRate <= 0.5) return 25;
  if (packetLossRate <= 1) return 22;
  if (packetLossRate <= 2) return 18;
  if (packetLossRate <= 3) return 12;
  if (packetLossRate <= 5) return 5;
  return 0;
}

function scoreFromJitter(jitterMs: number | null) {
  if (jitterMs === null) return 9;
  if (jitterMs <= 10) return 15;
  if (jitterMs <= 20) return 13;
  if (jitterMs <= 30) return 10;
  if (jitterMs <= 50) return 5;
  return 0;
}

function scoreFromMediaState(
  trackState: WanMediaTrackState | null,
  connectionState: string | null,
  sampleAgeMs: number | null
) {
  if (trackState === "failed" || connectionState === "failed" || connectionState === "closed") {
    return 0;
  }
  if (trackState === "live" || connectionState === "connected") {
    if (sampleAgeMs === null || sampleAgeMs <= 3_000) return 5;
    if (sampleAgeMs <= 6_000) return 3;
    return 1;
  }
  if (trackState === "ended") {
    return 1;
  }
  return 2;
}

function gradeFromScore(score: number): WanLinkScore["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function toneFromGrade(grade: WanLinkScore["grade"]): WanLinkTone {
  if (grade === "A") return "success";
  if (grade === "B") return "accent";
  if (grade === "C" || grade === "D") return "warning";
  return "danger";
}

export function buildWanLinkScore(input: WanLinkScoreInput): WanLinkScore {
  const playbackBitrateKbps = finitePositive(input.playbackBitrateKbps);
  const mediaDirection = input.mediaDirection ?? "unknown";
  const mediaTrackState = input.mediaTrackState ?? null;
  const mediaConnectionState = input.mediaConnectionState?.trim().toLowerCase() ?? null;
  const packetLossRate = finiteNonNegative(input.packetLossRate);
  const jitterMs = finiteNonNegative(input.jitterMs);
  const sampleAgeMs = finiteNonNegative(input.sampleAgeMs);
  const profileInput: PeerLinkProfileInput = {
    candidateType: input.candidateType,
    protocol: input.protocol,
    relayProtocol: input.relayProtocol,
    currentRoundTripTimeMs: input.rttMs,
    downloadRateKbps: input.downloadRateKbps,
    uploadRateKbps: input.uploadRateKbps,
    mediaTrackActive: mediaTrackState === "live",
    mediaBitrateKbps:
      mediaDirection === "send" ? input.uploadRateKbps : input.downloadRateKbps
  };
  const profile = resolvePeerLinkProfile(
    profileInput,
    mediaDirection === "send" ? "outgoing" : "incoming"
  );
  const rttMs = finiteNonNegative(input.rttMs);
  const downloadRateKbps = finiteNonNegative(input.downloadRateKbps);
  const uploadRateKbps = finiteNonNegative(input.uploadRateKbps);
  const providers = input.providers ?? [];
  const providerCount = providers.length;
  const effectiveMediaRate =
    mediaDirection === "send"
      ? uploadRateKbps
      : mediaDirection === "receive"
        ? downloadRateKbps
        : downloadRateKbps === null && uploadRateKbps === null
          ? null
          : Math.max(downloadRateKbps ?? 0, uploadRateKbps ?? 0);
  const throughputRatio =
    effectiveMediaRate === null || playbackBitrateKbps === null
      ? null
      : effectiveMediaRate / playbackBitrateKbps;

  let score =
    scoreFromProfile(profile) +
    scoreFromRtt(rttMs) +
    scoreFromThroughput(effectiveMediaRate, playbackBitrateKbps) +
    scoreFromPacketLoss(packetLossRate) +
    scoreFromJitter(jitterMs) +
    scoreFromMediaState(mediaTrackState, mediaConnectionState, sampleAgeMs);

  score = clamp(Math.round(score), 0, 100);
  const grade = gradeFromScore(score);
  const pathLabel = resolveWanPathLabel({
    candidateType: input.candidateType,
    protocol: input.protocol,
    relayProtocol: input.relayProtocol,
    profile
  });
  const tips: string[] = [];
  if (profile === "relay-udp") {
    tips.push("当前走 TURN UDP 中继；播放音频使用单向 RTP Opus 媒体轨道。");
  }
  if (profile === "constrained" || profile === "severe") {
    tips.push("链路被判为受限，RTP Opus 可能出现抖动或短暂重连。");
  }
  if (rttMs !== null && rttMs >= 250) {
    tips.push(`RTT ${Math.round(rttMs)}ms 偏高，拖动进度后的媒体恢复会更慢。`);
  }
  if (packetLossRate !== null && packetLossRate >= 3) {
    tips.push(`RTP 丢包率 ${packetLossRate.toFixed(1)}%，媒体轨道可能出现短暂断续。`);
  }
  if (jitterMs !== null && jitterMs >= 30) {
    tips.push(`jitter ${Math.round(jitterMs)}ms 偏高，正在消耗额外抖动缓冲。`);
  }
  if (throughputRatio !== null && throughputRatio < 1.25) {
    tips.push(`当前媒体 RTP 带宽只有音频码率的 ${throughputRatio.toFixed(1)} 倍，余量偏低。`);
  }
  if (mediaTrackState === "failed" || mediaConnectionState === "failed") {
    tips.push("当前 RTP Opus 媒体连接失败，等待 ICE 恢复。");
  } else if (mediaTrackState !== "live" && mediaConnectionState !== "connected") {
    tips.push("正在等待当前 RTP Opus 媒体轨道和统计样本。");
  }
  if (tips.length === 0) {
    tips.push("当前 RTP Opus 媒体轨道的路径、时延、丢包和 jitter 均在可接受范围内。");
  }

  const summary =
    grade === "A" || grade === "B"
      ? `外网评分 ${score}（${grade}）：可稳定承载当前 RTP Opus 音频。`
      : grade === "C"
        ? `外网评分 ${score}（${grade}）：可播放，但跳转后的媒体恢复可能波动。`
        : `外网评分 ${score}（${grade}）：实时音频余量不足或链路状态受限。`;

  return {
    score,
    grade,
    tone: toneFromGrade(grade),
    profile,
    pathLabel,
    summary,
    metrics: {
      rttLabel: rttMs === null ? "未知" : `${Math.round(rttMs)}ms`,
      downloadLabel: downloadRateKbps === null ? "未知" : formatTransferRateMBps(downloadRateKbps),
      uploadLabel: uploadRateKbps === null ? "未知" : formatTransferRateMBps(uploadRateKbps),
      providerLabel: providerCount <= 0 ? "未观测" : `${providerCount} 条媒体连接`,
      audioBitrateLabel: playbackBitrateKbps === null ? "未知" : `${Math.round(playbackBitrateKbps)} kbps`,
      headroomLabel: throughputRatio === null ? "未知" : `${throughputRatio.toFixed(1)}x`,
      packetLossLabel: packetLossRate === null ? "未知" : `${packetLossRate.toFixed(1)}%`,
      jitterLabel: jitterMs === null ? "未知" : `${Math.round(jitterMs)}ms`,
      directionLabel:
        mediaDirection === "send" ? "发送" : mediaDirection === "receive" ? "接收" : "未知",
      sampleAgeLabel:
        sampleAgeMs === null ? "未知" : sampleAgeMs <= 6_000 ? `${Math.ceil(sampleAgeMs / 1000)}s前` : "过期"
    },
    tips
  };
}

export function buildWanLinkScoreFromPeerDiagnostic(input: {
  diagnostic?: PeerDiagnosticsSnapshot | null;
  providers?: WanProviderSummary[];
  downloadRateKbps?: number | null;
  uploadRateKbps?: number | null;
  playbackBitrateKbps?: number | null;
  rttMs?: number | null;
}): WanLinkScore {
  const diagnostic = input.diagnostic ?? null;
  const mediaSendRate = input.uploadRateKbps ?? diagnostic?.mediaSendBitrateKbps ?? null;
  const mediaReceiveRate = input.downloadRateKbps ?? diagnostic?.mediaReceiveBitrateKbps ?? null;
  const mediaDirection: WanMediaDirection =
    mediaSendRate !== null && mediaSendRate > 0 &&
    (mediaReceiveRate === null || mediaSendRate >= mediaReceiveRate)
      ? "send"
      : mediaReceiveRate !== null && mediaReceiveRate > 0
        ? "receive"
        : "unknown";
  return buildWanLinkScore({
    candidateType: diagnostic?.mediaCandidateType ?? diagnostic?.dataCandidateType ?? diagnostic?.dataRemoteCandidateType ?? null,
    protocol: diagnostic?.mediaProtocol ?? diagnostic?.dataProtocol ?? null,
    relayProtocol: diagnostic?.mediaProtocol ?? diagnostic?.dataRelayProtocol ?? null,
    rttMs: input.rttMs ?? diagnostic?.currentRoundTripTimeMs ?? null,
    downloadRateKbps: input.downloadRateKbps ?? diagnostic?.mediaReceiveBitrateKbps ?? null,
    uploadRateKbps: input.uploadRateKbps ?? diagnostic?.mediaSendBitrateKbps ?? null,
    playbackBitrateKbps: input.playbackBitrateKbps,
    mediaDirection,
    mediaTrackState: mediaDirection === "unknown"
      ? diagnostic?.mediaConnectionState === "failed" ? "failed" : "none"
      : "live",
    mediaConnectionState: diagnostic?.mediaConnectionState ?? null,
    packetLossRate: diagnostic?.packetLossRate ?? null,
    jitterMs: diagnostic?.jitterMs ?? null,
    sampleAgeMs: diagnostic?.updatedAt
      ? Math.max(0, Date.now() - new Date(diagnostic.updatedAt).getTime())
      : null,
    providers: input.providers
  });
}
