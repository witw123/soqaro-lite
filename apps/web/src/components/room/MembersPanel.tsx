"use client";

import { memo, useState } from "react";
import { getRoomMemberPermissions, type PeerDiagnosticsSnapshot, type RoomMember, type RoomMemberPermissions } from "@soqaro/shared";
import type { PlaybackAudioPath } from "@/features/playback/use-segmented-opus-playback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  dedupeRoomMembers,
  formatMemberDuration,
  hasFreshLocalMediaObservation,
  hasFreshReportedMediaObservation,
  getMemberDurationMs,
  isMemberDataUnavailable,
  resolveMemberConnectionStatus,
} from "./member-data";

type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type LocalMemberPanelState = {
  memberId: string;
  audible: boolean | null;
  playbackPath?: PlaybackAudioPath;
  mediaSummary?: {
    receiveRateKbps: number | null;
    sendRateKbps: number | null;
    sampleAgeMs: number | null;
  };
  playbackStatus: {
    label: string;
    detail: string;
    tone: StatusTone;
    badgeText: string;
  };
};

type MembersPanelProps = {
  members: RoomMember[];
  now: number;
  activeSessionId: string | null;
  isHost: boolean;
  onUpdateMemberPermissions: (memberId: string, permissions: RoomMemberPermissions) => Promise<boolean>;
  onRemoveMember: (memberId: string) => Promise<boolean>;
};

const memberPermissionOptions: Array<[keyof RoomMemberPermissions, string, string]> = [
  ["library", "曲库权", "上传和管理房间曲库"],
  ["queue", "队列权", "添加和整理共享队列"],
  ["player", "播放器权", "控制房间播放状态"]
];

export function MemberPermissionControls({
  permissions,
  onChange,
  pendingPermission = null,
  disabled = false
}: {
  permissions: RoomMemberPermissions;
  onChange: (permission: keyof RoomMemberPermissions, checked: boolean) => void;
  pendingPermission?: keyof RoomMemberPermissions | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {memberPermissionOptions.map(([permission, label, description]) => {
        const checked = permissions[permission];
        const pending = pendingPermission === permission;
        return (
                      <div key={permission} className="flex min-h-9 items-center justify-between gap-2.5 rounded-lg border border-surface-border px-2.5 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">{label}</span>
              <span className="mt-0.5 block truncate text-xs text-foreground-muted">{description}</span>
            </span>
            <button
              aria-checked={checked}
              aria-label={`${label}${checked ? "已开启" : "已关闭"}`}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${checked ? "bg-accent" : "bg-surface-hover"} ${pending ? "cursor-wait opacity-60" : ""}`}
              disabled={disabled || pendingPermission !== null}
              onClick={() => onChange(permission, !checked)}
              role="switch"
              type="button"
            >
              <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function getPresence(member: RoomMember) {
  if (member.presenceState === "online") {
    return { dot: "animate-pulse bg-green-500", text: "text-green-400", label: "在线" };
  }
  if (member.presenceState === "reconnecting") {
    return { dot: "bg-amber-400", text: "text-amber-300", label: "重连中" };
  }
  return { dot: "bg-neutral-600", text: "text-foreground-muted", label: "离线" };
}

export function getPlaybackStatus(
  presenceState: RoomMember["presenceState"],
  peerDiagnostics: PeerDiagnosticsSnapshot | undefined,
  options: { playbackActive?: boolean; isCurrentSource?: boolean; now?: number } = {}
) {
  const playbackActive = options.playbackActive ?? true;
  const isCurrentSource = options.isCurrentSource ?? true;
  const now = options.now ?? Date.now();

  if (presenceState === "offline") {
    return { label: "离线", detail: "", tone: "neutral" as const, badgeText: "离线" };
  }
  if (presenceState === "reconnecting") {
    return { label: "正在重连", detail: "", tone: "warning" as const, badgeText: "正在重连" };
  }
  const connection = resolveMemberConnectionStatus(peerDiagnostics, now);
  const hasFreshReceiveAudio = hasFreshLocalMediaObservation(peerDiagnostics, "receive", now);
  const hasFreshSendAudio = hasFreshLocalMediaObservation(peerDiagnostics, "send", now);
  const hasFreshReportedReceiveAudio = hasFreshReportedMediaObservation(peerDiagnostics, "receive", now);
  const hasFreshReportedSourceAudio = hasFreshReportedMediaObservation(peerDiagnostics, "send", now);
  const hasFreshReportedAudible = (() => {
    const reportedAt = peerDiagnostics?.reportedAudibleAt ?? peerDiagnostics?.reportedTelemetryAt;
    const ageMs = reportedAt ? Math.max(0, now - Date.parse(reportedAt)) : null;
    return ageMs !== null && Number.isFinite(ageMs) && ageMs <= 6_000 &&
      typeof peerDiagnostics?.reportedAudible === "boolean";
  })();
  const hasFreshExpectedAudio = (isCurrentSource && (
    hasFreshReceiveAudio || hasFreshSendAudio || hasFreshReportedSourceAudio
  )) || (!isCurrentSource && (
    hasFreshReceiveAudio || hasFreshReportedReceiveAudio
  ));
  const hasFreshLocalExpectedAudio = isCurrentSource
    ? hasFreshReceiveAudio || hasFreshSendAudio
    : hasFreshReceiveAudio;
  const mediaTrackUnavailable = ["ended", "failed"].includes(
    peerDiagnostics?.mediaTrackState ?? ""
  );
  if (!playbackActive) {
    return connection.dataReady || connection.mediaReady
      ? { label: "连接正常", detail: "", tone: "accent" as const, badgeText: "连接正常" }
      : { label: "连接中", detail: "", tone: "neutral" as const, badgeText: "连接中" };
  }
  if (!hasFreshLocalExpectedAudio &&
    (peerDiagnostics?.mediaConnectionState === "failed" ||
      peerDiagnostics?.mediaTrackState === "ended" ||
      peerDiagnostics?.mediaTrackState === "failed" ||
      peerDiagnostics?.transportScore === "failed")) {
    return {
      label: "音频异常",
      detail: "",
      tone: "danger" as const,
      badgeText: "音频异常"
    };
  }
  if (
    hasFreshExpectedAudio && (!mediaTrackUnavailable || hasFreshLocalExpectedAudio) ||
    hasFreshReportedAudible && peerDiagnostics?.reportedAudible === true && !mediaTrackUnavailable
  ) {
    return {
      label: "正常出声",
      detail: "",
      tone: "success" as const,
      badgeText: "正常出声"
    };
  }
  if (!isCurrentSource && hasFreshSendAudio) {
    return { label: "连接正常", detail: "", tone: "accent" as const, badgeText: "连接正常" };
  }
  if (
    connection.mediaReady ||
    connection.mediaState === "connected" ||
    connection.mediaState === "completed" ||
    connection.dataReady ||
    connection.mediaTrackState === "ended" ||
    connection.mediaTrackState === "failed"
  ) {
    return { label: "音频准备中", detail: "", tone: "warning" as const, badgeText: "音频准备中" };
  }
  return { label: "连接中", detail: "", tone: "neutral" as const, badgeText: "连接中" };
}

const memberReportedTelemetryFreshMs = 6_000;

export type MemberAudibleStatus = {
  label: "正在发声" | "本地播放" | "正在播放" | "未发声" | "未播放" | "等待音频" | "等待重连" | "离线";
  tone: StatusTone;
  active: boolean;
};

export function isMemberCurrentSource(input: {
  member: Pick<RoomMember, "id" | "peerId">;
  sourceSessionId?: string | null;
  sourcePeerId: string | null;
}) {
  // sourceSessionId is stable across peer reconnects. Only use the peer id
  // for snapshots from before session identity was persisted.
  if (input.sourceSessionId !== null && input.sourceSessionId !== undefined) {
    return input.member.id === input.sourceSessionId;
  }

  return input.member.peerId !== null && input.member.peerId === input.sourcePeerId;
}

export function getMemberAudibleStatus(input: {
  presenceState: RoomMember["presenceState"];
  playbackActive: boolean;
  isLocal: boolean;
  isCurrentSource?: boolean;
  localMemberState: LocalMemberPanelState | null;
  diagnostic: PeerDiagnosticsSnapshot | undefined;
  now?: number;
}): MemberAudibleStatus {
  const isCurrentSource = input.isCurrentSource ?? true;
  const isLocalPlayback = input.localMemberState?.playbackPath === "local-file" ||
    input.localMemberState?.playbackPath === "local-segmented";
  if (input.presenceState === "offline") {
    return { label: "离线", tone: "neutral", active: false };
  }
  if (input.presenceState === "reconnecting") {
    return { label: "等待重连", tone: "warning", active: false };
  }
  if (!input.playbackActive) {
    return {
      label: input.isCurrentSource ? "未发声" : "未播放",
      tone: "neutral",
      active: false
    };
  }

  if (input.isLocal) {
    if (input.localMemberState?.audible === true) {
      return {
        label: isCurrentSource ? "正在发声" : isLocalPlayback ? "本地播放" : "正在播放",
        tone: "success",
        active: true
      };
    }
    if (input.localMemberState?.audible === false) {
      return {
        label: isCurrentSource ? "未发声" : "未播放",
        tone: "warning",
        active: false
      };
    }
    return { label: "等待音频", tone: "accent", active: false };
  }

  if (isMemberDataUnavailable(input.diagnostic)) {
    return { label: "等待重连", tone: "warning", active: false };
  }
  if (["ended", "failed"].includes(input.diagnostic?.mediaTrackState ?? "")) {
    return { label: "等待音频", tone: "warning", active: false };
  }

  const reportedAt = input.diagnostic?.reportedAudibleAt ?? input.diagnostic?.reportedTelemetryAt;
  const reportedAtMs = reportedAt ? Date.parse(reportedAt) : Number.NaN;
  const sampleAgeMs = Number.isFinite(reportedAtMs)
    ? Math.max(0, (input.now ?? Date.now()) - reportedAtMs)
    : null;
  if (sampleAgeMs === null || sampleAgeMs > memberReportedTelemetryFreshMs) {
    return { label: "等待音频", tone: "accent", active: false };
  }

  if (typeof input.diagnostic?.reportedAudible === "boolean") {
    return input.diagnostic.reportedAudible
      ? {
          label: isCurrentSource ? "正在发声" : "正在播放",
          tone: "success",
          active: true
        }
      : {
          label: isCurrentSource ? "未发声" : "未播放",
          tone: "warning",
          active: false
        };
  }

  // Older peers do not send an explicit audible flag. A source can fall back
  // to its own outbound RTP; a listener can only be labelled as playing from
  // its own inbound RTP, never as speaking from an inbound aggregate.
  const hasReportedSourceTraffic = hasFreshReportedMediaObservation(
    input.diagnostic,
    "send",
    input.now
  );
  const hasReportedListenerTraffic = hasFreshReportedMediaObservation(
    input.diagnostic,
    "receive",
    input.now
  );
  if (!hasReportedSourceTraffic && !hasReportedListenerTraffic) {
    return { label: "等待音频", tone: "accent", active: false };
  }
  const hasExpectedTraffic = isCurrentSource
    ? hasReportedSourceTraffic
    : hasReportedListenerTraffic;
  return hasExpectedTraffic
    ? {
        label: isCurrentSource ? "正在发声" : "正在播放",
        tone: "success",
        active: true
      }
    : { label: "等待音频", tone: "accent", active: false };
}

export function resolveMemberMediaRates(input: {
  diagnostic: PeerDiagnosticsSnapshot | undefined;
  isLocal: boolean;
  localMemberState: LocalMemberPanelState | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();

  if (input.isLocal) {
    const sampleAgeMs = input.localMemberState?.mediaSummary?.sampleAgeMs ?? null;
    const localFresh =
      sampleAgeMs === null || sampleAgeMs <= memberReportedTelemetryFreshMs;
    const sendRateKbps = localFresh
      ? input.localMemberState?.mediaSummary?.sendRateKbps ??
        input.diagnostic?.reportedSendRateKbps ??
        input.diagnostic?.mediaSendBitrateKbps ??
        null
      : null;
    const receiveRateKbps = localFresh
      ? input.localMemberState?.mediaSummary?.receiveRateKbps ??
        input.diagnostic?.reportedReceiveRateKbps ??
        input.diagnostic?.mediaReceiveBitrateKbps ??
        null
      : null;
    return {
      sendRateKbps,
      receiveRateKbps,
      sampleAgeMs
    };
  }

  // Only use the remote peer's self-reported aggregate rates. Local path samples
  // (mediaSend/Receive on this browser) describe this browser's link, not that member's totals.
  if (isMemberDataUnavailable(input.diagnostic)) {
    return {
      sendRateKbps: null,
      receiveRateKbps: null,
      sampleAgeMs: null
    };
  }
  if (["ended", "failed"].includes(input.diagnostic?.mediaTrackState ?? "")) {
    return {
      sendRateKbps: null,
      receiveRateKbps: null,
      sampleAgeMs: null
    };
  }
  const reportedAt = input.diagnostic?.reportedTelemetryAt;
  const reportedAtMs = reportedAt ? Date.parse(reportedAt) : Number.NaN;
  const sampleAgeMs = Number.isFinite(reportedAtMs) ? Math.max(0, now - reportedAtMs) : null;
  const reportedFresh =
    sampleAgeMs !== null && sampleAgeMs <= memberReportedTelemetryFreshMs;
  if (!reportedFresh) {
    return {
      sendRateKbps: null,
      receiveRateKbps: null,
      sampleAgeMs
    };
  }

  return {
    sendRateKbps: input.diagnostic?.reportedSendRateKbps ?? null,
    receiveRateKbps: input.diagnostic?.reportedReceiveRateKbps ?? null,
    sampleAgeMs
  };
}

function MembersPanelBase({
  members,
  now,
  activeSessionId,
  isHost,
  onUpdateMemberPermissions,
  onRemoveMember
}: MembersPanelProps) {
  const [openSettingsMemberId, setOpenSettingsMemberId] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RoomMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const normalizedMembers = dedupeRoomMembers(members);

  const handlePermissionChange = async (
    member: RoomMember,
    permission: keyof RoomMemberPermissions,
    checked: boolean
  ) => {
    const key = `${member.id}:${permission}`;
    setPendingPermission(key);
    try {
      await onUpdateMemberPermissions(member.id, {
        ...getRoomMemberPermissions(member),
        [permission]: checked
      });
    } finally {
      setPendingPermission(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const removed = await onRemoveMember(removeTarget.id);
      if (removed) setRemoveTarget(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <section className="flex w-full flex-col gap-1.5" data-testid="members-panel">
      {normalizedMembers.length > 0 ? (
        <div className="divide-y divide-surface-border/40">
          {normalizedMembers.map((member) => {
            const presence = getPresence(member);
            const canManageMember = isHost && member.role !== "host" && member.id !== activeSessionId;
            const isSettingsOpen = openSettingsMemberId === member.id;

            return (
              <div key={member.id} className="group">
                <article>
                  <button
                    aria-controls={`member-permissions-${member.id}`}
                    aria-expanded={isSettingsOpen}
                    className="flex w-full min-w-0 items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent sm:px-3"
                    data-testid={`member-settings-${member.id}`}
                    onClick={() => setOpenSettingsMemberId(isSettingsOpen ? null : member.id)}
                    type="button"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-surface-border/60 bg-surface text-xs font-semibold text-foreground">
                      {member.nickname.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="truncate text-xs sm:text-sm font-semibold text-foreground">{member.nickname}</strong>
                        {member.id === activeSessionId ? <span className="shrink-0 text-xs text-foreground-muted">本机</span> : null}
                      </span>
                      <span className="block text-xs text-foreground-muted">
                        {member.role === "host" ? "房主" : "成员"}
                      </span>
                    </span>
                    <span className={`flex shrink-0 items-center gap-1.5 text-xs ${presence.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${presence.dot}`} />
                      {presence.label}
                    </span>
                    <svg aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform duration-200 ${isSettingsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </article>
                {isSettingsOpen ? (
                  <div className="motion-safe:animate-fade-in border-t border-surface-border/40 bg-surface/30 px-2.5 py-2 sm:px-3" data-testid={`member-permissions-${member.id}`} id={`member-permissions-${member.id}`}>
                    <div className="mb-2 flex items-start justify-between gap-2.5">
                      <div>
                        <span className="block text-xs font-semibold text-foreground">房间权限</span>
                        <span className="mt-0.5 block text-xs tabular-nums text-foreground-muted" data-testid={`member-duration-${member.id}`}>
                          已在房间 {formatMemberDuration(getMemberDurationMs(member, now))}
                        </span>
                      </div>
                      {canManageMember ? (
                        <Button
                          aria-label={`移除 ${member.nickname}`}
                          className="h-7 px-2 text-xs text-red-300 hover:text-red-200"
                          data-testid={`member-remove-${member.id}`}
                          onClick={() => setRemoveTarget(member)}
                          title="移除成员"
                          type="button"
                          variant="ghost"
                        >
                          移除成员
                        </Button>
                      ) : (
                        <span className="pt-0.5 text-xs text-foreground-muted">仅房主可修改</span>
                      )}
                    </div>
                    <MemberPermissionControls
                      disabled={!canManageMember || pendingPermission !== null}
                      onChange={(permission, checked) => void handlePermissionChange(member, permission, checked)}
                      pendingPermission={pendingPermission?.startsWith(`${member.id}:`) ? pendingPermission.slice(member.id.length + 1) as keyof RoomMemberPermissions : null}
                      permissions={getRoomMemberPermissions(member)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-foreground-muted">
          当前还没有成员进入房间。
        </p>
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        title="移除房间成员"
        description={removeTarget ? `确定要将“${removeTarget.nickname}”移出这个房间吗？对方会立即失去房间访问权限。` : ""}
        confirmLabel="移除成员"
        destructive
        pending={isRemoving}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void handleRemove()}
      />
    </section>
  );
}

export const MembersPanel = memo(MembersPanelBase);
