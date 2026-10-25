"use client";

import { useMemo } from "react";
import type {
  IceConfigResponse,
  PeerDiagnosticsSnapshot,
  PeerRecentEvent,
  RoomSnapshot
} from "@soqaro/shared";
import type { LocalMemberPanelState } from "@/components/room/MembersPanel";
import {
  dedupePeerDiagnostics,
  dedupeRoomMembers,
  hasRecentLocalMediaSample
} from "../member-data";
import { resolveCurrentSourcePeerId } from "@/features/room/hooks/use-room-page-derived";
import type { RoomCoarsePlaybackState } from "@/features/room/playback/room-coarse-playback";
export type UseRoomDerivedStateInput = {
  roomSnapshot: RoomSnapshot | null;
  connectedPeers: string[];
  mediaConnectedPeers: string[];
  activeDashboardTab: "library" | "search" | "local" | "members";
  coarsePlayback: RoomCoarsePlaybackState;
  peerDiagnostics: PeerDiagnosticsSnapshot[];
  peerRecentEvents: PeerRecentEvent[];
  canDeleteRoom: boolean;
  statusMessage: string;
  iceConfig: IceConfigResponse | null;
  iceConfigResolved: boolean;
  workspaceOnly: boolean;
  initialRoomId: string | null;
  activeSessionUserId?: string;
  suppressRoomRecovery: boolean;
  isNavigatingRoomExit: boolean;
  isRecoveringRoom: boolean;
};

const emptyWorkspacePeerDiagnostics: PeerDiagnosticsSnapshot[] = [];
const emptyWorkspacePeerRecentEvents: PeerRecentEvent[] = [];

export function isLocalPlaybackAudible(coarsePlayback: RoomCoarsePlaybackState) {
  return coarsePlayback.state === "live" && (
    coarsePlayback.sourceHealth === undefined ||
    coarsePlayback.sourceHealth === "source-ready"
  );
}

export function useRoomDerivedState({
  roomSnapshot,
  connectedPeers,
  mediaConnectedPeers,
  coarsePlayback,
  peerDiagnostics,
  peerRecentEvents,
  canDeleteRoom,
  statusMessage,
  iceConfig,
  iceConfigResolved,
  workspaceOnly,
  initialRoomId,
  activeSessionUserId,
  suppressRoomRecovery,
  isNavigatingRoomExit,
  isRecoveringRoom
}: UseRoomDerivedStateInput) {
  const roomMembers = useMemo(
    () => (roomSnapshot ? dedupeRoomMembers(roomSnapshot.room.members) : null),
    [roomSnapshot]
  );
  const host = roomMembers?.find((member) => member.role === "host");
  const activeMemberPeerIds = useMemo(
    () => getActiveMemberPeerIds(roomMembers ?? []),
    [roomMembers]
  );
  const currentSourcePeerId = useMemo(
    () => resolveCurrentSourcePeerId(roomSnapshot, roomSnapshot?.room.playback),
    [roomSnapshot]
  );
  const canDisbandRoom =
    !!roomSnapshot &&
    canDeleteRoom;

  const visiblePeerDiagnostics = useMemo(() => {
    return filterVisiblePeerDiagnostics(
      peerDiagnostics,
      activeMemberPeerIds,
      currentSourcePeerId
    )
      .sort((left, right) => {
        const leftPriority = getDiagnosticPriority(left.peerId, currentSourcePeerId);
        const rightPriority = getDiagnosticPriority(right.peerId, currentSourcePeerId);
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [activeMemberPeerIds, currentSourcePeerId, peerDiagnostics]);

  const visiblePeerRecentEvents = useMemo(() => {
    const visiblePeerIds = new Set(visiblePeerDiagnostics.map((item) => item.peerId));
    return peerRecentEvents.filter((event) => visiblePeerIds.has(event.peerId));
  }, [peerRecentEvents, visiblePeerDiagnostics]);

  const localMemberState = useMemo<LocalMemberPanelState | null>(() => {
    if (!roomSnapshot || !activeSessionUserId) {
      return null;
    }

    const localMember =
      roomMembers?.find((member) => member.id === activeSessionUserId) ?? null;
    if (!localMember) {
      return null;
    }

    const diagnostics = dedupePeerDiagnostics(peerDiagnostics);
    const systemDiagnostic = diagnostics.find((peer) => peer.peerId === "system");
    const activePeerDiagnostics = diagnostics.filter((peer) =>
      activeMemberPeerIds.has(peer.peerId)
    );
    const activeMediaDiagnostics = activePeerDiagnostics.filter((peer) => hasRecentLocalMediaSample(peer));
    // Prefer the local aggregate that this browser itself measured and reported.
    // Fall back to summing live peer-link samples only when self-report is missing/stale.
    const reportedAgeMs = getReportedTelemetryAgeMs(systemDiagnostic);
    const hasFreshReportedTelemetry =
      reportedAgeMs !== null && reportedAgeMs <= 6_000;
    const totalMediaReceiveRateKbps = hasFreshReportedTelemetry
      ? systemDiagnostic?.reportedReceiveRateKbps ?? 0
      : sumDiagnosticsValue(activeMediaDiagnostics, "mediaReceiveBitrateKbps");
    const totalMediaSendRateKbps = hasFreshReportedTelemetry
      ? systemDiagnostic?.reportedSendRateKbps ?? 0
      : sumDiagnosticsValue(activeMediaDiagnostics, "mediaSendBitrateKbps");
    const mediaSampleAgeMs =
      reportedAgeMs ??
      getLatestMetricSampleAgeMs(activePeerDiagnostics, [
        "mediaReceiveBitrateKbps",
        "mediaSendBitrateKbps"
      ]);
    const playbackStatus = getLocalPlaybackStatus({
      presenceState: localMember.presenceState,
      playbackStatus: roomSnapshot.room.playback.status,
      coarsePlayback
    });
    const audible = isLocalPlaybackAudible(coarsePlayback);
    return {
      memberId: localMember.id,
      audible,
      playbackPath: coarsePlayback.audioPath,
      mediaSummary: {
        receiveRateKbps: totalMediaReceiveRateKbps,
        sendRateKbps: totalMediaSendRateKbps,
        sampleAgeMs: mediaSampleAgeMs
      },
      playbackStatus
    };
  }, [
    activeMemberPeerIds,
    activeSessionUserId,
    peerDiagnostics,
    roomSnapshot,
    roomMembers,
    coarsePlayback
  ]);

  const statusTone =
    statusMessage.includes("失败") || statusMessage.includes("不可用")
      ? "warning"
      : statusMessage.includes("已")
        ? "success"
        : "neutral";

  const iceConfigStatus = iceConfig
    ? `当前 ICE 配置来源：${iceConfig.source}，共 ${iceConfig.iceServers.length} 组服务器。`
    : iceConfigResolved
      ? "当前未拿到短期 TURN 凭证，已回退静态 STUN/TURN 配置。"
      : "正在获取 ICE/TURN 配置…";

  const iceConfigSource = iceConfig?.source ?? (iceConfigResolved ? "static-fallback" : "loading");

  const isRoomTransitionPending =
    workspaceOnly &&
    !!initialRoomId &&
    !!activeSessionUserId &&
    !suppressRoomRecovery &&
    !roomSnapshot;

  const showRoomTransitionState =
    isNavigatingRoomExit || isRecoveringRoom || isRoomTransitionPending;

  return {
    host,
    canDisbandRoom,
    connectedPeersCount: countPeersWithinActiveMembers(connectedPeers, activeMemberPeerIds),
    mediaConnectedPeersCount: countPeersWithinActiveMembers(
      mediaConnectedPeers,
      activeMemberPeerIds
    ),
    localMemberState,
    visiblePeerDiagnostics,
    visiblePeerRecentEvents,
    statusTone,
    iceConfigStatus,
    iceConfigSource,
    isRoomTransitionPending,
    showRoomTransitionState
  };
}

function getDiagnosticPriority(peerId: string, sourcePeerId: string | null) {
  if (peerId === "system") {
    return 0;
  }

  if (peerId === sourcePeerId) {
    return 1;
  }

  return 3;
}

export function getActiveMemberPeerIds(members: RoomSnapshot["room"]["members"]) {
  return new Set(
    members
      .filter((member) => member.presenceState === "online")
      .map((member) => member.peerId)
      .filter((memberPeerId): memberPeerId is string => !!memberPeerId)
  );
}

export function selectWorkspacePeerDiagnostics(input: {
  activeDashboardTab: "library" | "search" | "local" | "members";
  visiblePeerDiagnostics: PeerDiagnosticsSnapshot[];
  visiblePeerRecentEvents: PeerRecentEvent[];
}) {
  if (input.activeDashboardTab === "members") {
    return {
      peerDiagnostics: input.visiblePeerDiagnostics,
      peerRecentEvents: input.visiblePeerRecentEvents
    };
  }

  return {
    peerDiagnostics: emptyWorkspacePeerDiagnostics,
    peerRecentEvents: emptyWorkspacePeerRecentEvents
  };
}

export function countPeersWithinActiveMembers(
  peerIds: string[],
  activeMemberPeerIds: Set<string>
) {
  return new Set(peerIds.filter((peerId) => activeMemberPeerIds.has(peerId))).size;
}


function getReportedTelemetryAgeMs(diagnostic: PeerDiagnosticsSnapshot | undefined, now = Date.now()) {
  if (!diagnostic?.reportedTelemetryAt) {
    return null;
  }
  const timestampMs = Date.parse(diagnostic.reportedTelemetryAt);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return Math.max(0, now - timestampMs);
}

function sumDiagnosticsValue(
  diagnostics: PeerDiagnosticsSnapshot[],
  key: "mediaSendBitrateKbps" | "mediaReceiveBitrateKbps"
) {
  const values = diagnostics
    .map((peer) => peer[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function getLatestMetricSampleAgeMs(
  diagnostics: PeerDiagnosticsSnapshot[],
  keys: Array<"mediaReceiveBitrateKbps" | "mediaSendBitrateKbps">,
  now = Date.now()
) {
  const latestTimestampMs = diagnostics.reduce<number | null>((latest, diagnostic) => {
    const hasMetric = keys.some(
      (key) => typeof diagnostic[key] === "number" && Number.isFinite(diagnostic[key])
    );
    if (!hasMetric) {
      return latest;
    }

    const timestamp = diagnostic.lastMediaStatsProgressAt ?? diagnostic.lastMediaPacketAt ?? null;
    if (!timestamp) {
      return latest;
    }
    const timestampMs = new Date(timestamp).getTime();
    if (!Number.isFinite(timestampMs)) {
      return latest;
    }

    return latest === null ? timestampMs : Math.max(latest, timestampMs);
  }, null);

  return latestTimestampMs === null ? null : Math.max(0, now - latestTimestampMs);
}

export function getLocalPlaybackStatus(input: {
  presenceState: RoomSnapshot["room"]["members"][number]["presenceState"];
  playbackStatus: RoomSnapshot["room"]["playback"]["status"];
  coarsePlayback: RoomCoarsePlaybackState;
}): LocalMemberPanelState["playbackStatus"] {
  if (input.presenceState === "offline") {
    return {
      label: "本机已离线",
      detail: "当前成员已离线。",
      tone: "warning",
      badgeText: "offline"
    };
  }

  if (input.presenceState === "reconnecting") {
    return {
      label: "媒体链路重连中",
      detail: "本机正在恢复房间状态与 RTP Opus 音频轨道。",
      tone: "warning",
      badgeText: "reconnecting"
    };
  }

  if (input.playbackStatus !== "playing") {
    return {
      label: "本地待机",
      detail: "当前房间未播放，媒体轨道保持待命。",
      tone: "neutral",
      badgeText: "Media idle"
    };
  }

  switch (input.coarsePlayback.state) {
    case "live":
      return {
        label: "正常出声",
        detail: "本机正在发送或接收可播放的实时音频。",
        tone: "success",
        badgeText: "RTP Opus"
      };
    case "buffering":
      return {
        label: input.coarsePlayback.lastError ? "正在自动恢复" : "等待媒体轨道",
        detail:
          input.coarsePlayback.lastError ??
          "正在等待当前播放源建立或恢复 RTP Opus 音频轨道。",
        tone: input.coarsePlayback.lastError ? "warning" : "accent",
        badgeText: "Media buffering"
      };
    case "awaiting-unlock":
      return {
        label: "等待本机音频解锁",
        detail: "AudioContext 当前未运行，点击播放或在房间内交互即可恢复。",
        tone: "warning",
        badgeText: "Audio unlock"
      };
    case "unavailable":
      return {
        label: "媒体源不可用",
        detail: "当前播放源没有可用的 WebRTC 音频轨道。",
        tone: "danger",
        badgeText: "Media failed"
      };
    case "paused":
      return {
        label: "本地已暂停",
        detail: "房间播放已暂停，已停止媒体音频输出。",
        tone: "neutral",
        badgeText: "Media paused"
      };
    case "ended":
      return {
        label: "当前曲目已结束",
        detail: "本机已完成当前媒体轨道。",
        tone: "neutral",
        badgeText: "Media ended"
      };
    default:
      return {
        label: "准备媒体播放",
        detail: "正在等待当前播放源与房间时间线。",
        tone: "neutral",
        badgeText: "Media idle"
      };
  }
}

export function filterVisiblePeerDiagnostics(
  peerDiagnostics: PeerDiagnosticsSnapshot[],
  activeMemberPeerIds: Set<string>,
  sourcePeerId: string | null
) {
  const visiblePeerIds = new Set<string>(["system"]);
  for (const peerId of activeMemberPeerIds) {
    visiblePeerIds.add(peerId);
  }
  if (sourcePeerId) {
    visiblePeerIds.add(sourcePeerId);
  }

  return dedupePeerDiagnostics(peerDiagnostics).filter((peer) => visiblePeerIds.has(peer.peerId));
}
