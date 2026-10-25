import type { PeerDiagnosticsSnapshot, RoomMember } from "@soqaro/shared";

export const realtimeMediaSampleWindowMs = 6_000;

const presencePriority: Record<RoomMember["presenceState"], number> = {
  online: 3,
  reconnecting: 2,
  offline: 1
};

function preferMember(current: RoomMember, candidate: RoomMember) {
  const currentScore = presencePriority[current.presenceState] + (current.peerId ? 1 : 0);
  const candidateScore = presencePriority[candidate.presenceState] + (candidate.peerId ? 1 : 0);
  return candidateScore >= currentScore ? candidate : current;
}

export function dedupeRoomMembers(members: RoomMember[]) {
  const byMemberId = new Map<string, RoomMember>();
  for (const member of members) {
    const current = byMemberId.get(member.id);
    byMemberId.set(member.id, current ? preferMember(current, member) : member);
  }
  return [...byMemberId.values()];
}

export function getMemberDurationMs(
  member: Pick<RoomMember, "joinedAt">,
  now = Date.now()
) {
  const joinedAtMs = getTimestampMs(member.joinedAt);
  if (!Number.isFinite(joinedAtMs) || !Number.isFinite(now)) {
    return 0;
  }

  return Math.max(0, now - joinedAtMs);
}

export function formatMemberDuration(durationMs: number) {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1_000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3_600);

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function dedupePeerDiagnostics(diagnostics: PeerDiagnosticsSnapshot[]) {
  const byPeerId = new Map<string, PeerDiagnosticsSnapshot>();
  for (const diagnostic of diagnostics) {
    const current = byPeerId.get(diagnostic.peerId);
    if (!current || getTimestampMs(diagnostic.updatedAt) >= getTimestampMs(current.updatedAt)) {
      byPeerId.set(diagnostic.peerId, diagnostic);
    }
  }
  return [...byPeerId.values()];
}

export function getMediaSampleAgeMs(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
) {
  if (!diagnostic) {
    return null;
  }

  const ages = [
    diagnostic.reportedTelemetryAt,
    diagnostic.lastMediaStatsProgressAt,
    diagnostic.lastMediaPacketAt
  ]
    .map((timestamp) => getTimestampAgeMs(timestamp, now))
    .filter((age): age is number => age !== null);
  if (ages.length === 0) {
    return null;
  }
  return Math.min(...ages);
}

function getTimestampAgeMs(timestamp: string | null | undefined, now: number) {
  if (!timestamp) {
    return null;
  }
  const timestampMs = getTimestampMs(timestamp);
  return Number.isFinite(timestampMs) ? Math.max(0, now - timestampMs) : null;
}

export function getLocalMediaSampleAgeMs(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
) {
  if (!diagnostic) {
    return null;
  }
  return getTimestampAgeMs(
    diagnostic.lastMediaStatsProgressAt ?? diagnostic.lastMediaPacketAt ?? null,
    now
  );
}

export function hasRecentLocalMediaSample(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
) {
  const sampleAgeMs = getLocalMediaSampleAgeMs(diagnostic, now);
  return sampleAgeMs !== null && sampleAgeMs <= realtimeMediaSampleWindowMs;
}

export function hasFreshLocalMediaObservation(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  direction: "send" | "receive",
  now = Date.now()
) {
  if (!diagnostic) {
    return false;
  }

  const rate = direction === "send"
    ? diagnostic.mediaSendBitrateKbps
    : diagnostic.mediaReceiveBitrateKbps;
  const sampleAgeMs = getLocalMediaSampleAgeMs(diagnostic, now);
  return typeof rate === "number" && rate > 0 &&
    sampleAgeMs !== null && sampleAgeMs <= realtimeMediaSampleWindowMs;
}

export function hasFreshReportedMediaObservation(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  direction: "send" | "receive",
  now = Date.now()
) {
  if (!diagnostic) {
    return false;
  }

  const rate = direction === "send"
    ? diagnostic.reportedSendRateKbps
    : diagnostic.reportedReceiveRateKbps;
  const sampleAgeMs = getTimestampAgeMs(diagnostic.reportedTelemetryAt, now);
  return typeof rate === "number" && rate > 0 &&
    sampleAgeMs !== null && sampleAgeMs <= realtimeMediaSampleWindowMs;
}

export type MemberConnectionStatus = {
  dataState: string | null;
  mediaState: string | null;
  mediaTrackState: PeerDiagnosticsSnapshot["mediaTrackState"];
  dataReady: boolean;
  mediaReady: boolean;
  localReceiveActive: boolean;
  localSendActive: boolean;
  reportedReceiveActive: boolean;
  reportedSendActive: boolean;
};

export function resolveMemberConnectionStatus(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
): MemberConnectionStatus {
  const localReceiveActive = hasFreshLocalMediaObservation(diagnostic, "receive", now);
  const localSendActive = hasFreshLocalMediaObservation(diagnostic, "send", now);
  const reportedReceiveActive = hasFreshReportedMediaObservation(diagnostic, "receive", now);
  const reportedSendActive = hasFreshReportedMediaObservation(diagnostic, "send", now);
  const dataChannelState = diagnostic?.dataChannelState ?? null;
  const dataConnectionState = diagnostic?.dataConnectionState ?? null;
  const dataFailed = [dataChannelState, dataConnectionState].some((state) =>
    ["closed", "failed", "disconnected"].includes(state ?? "")
  );
  const dataPending = dataChannelState !== null
    ? dataChannelState !== "open"
    : ["new", "connecting", "checking"].includes(dataConnectionState ?? "");
  const dataReady = !dataFailed && (
    dataChannelState === "open" ||
    (!dataPending && (reportedReceiveActive || reportedSendActive))
  );
  const mediaState = diagnostic?.mediaConnectionState ?? null;
  const mediaTrackState = diagnostic?.mediaTrackState ?? null;
  const mediaFailed = ["closed", "failed", "disconnected"].includes(mediaState ?? "") ||
    ["ended", "failed"].includes(mediaTrackState ?? "");
  const mediaReady = !mediaFailed && (
    localReceiveActive ||
    localSendActive
  );

  return {
    dataState: dataChannelState ?? dataConnectionState ?? (
      reportedReceiveActive || reportedSendActive ? "open" : null
    ),
    mediaState,
    mediaTrackState,
    dataReady,
    mediaReady,
    localReceiveActive,
    localSendActive,
    reportedReceiveActive,
    reportedSendActive
  };
}

export function isMemberDataUnavailable(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined
) {
  const dataChannelState = diagnostic?.dataChannelState ?? null;
  const dataConnectionState = diagnostic?.dataConnectionState ?? null;
  return (
    ["disconnected", "failed", "closed"].includes(dataConnectionState ?? "") ||
    (dataChannelState !== null
      ? dataChannelState !== "open"
      : ["new", "connecting", "checking"].includes(dataConnectionState ?? ""))
  );
}

export function hasFreshMediaObservation(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
) {
  if (!diagnostic) {
    return false;
  }

  return hasFreshLocalMediaObservation(diagnostic, "send", now) ||
    hasFreshLocalMediaObservation(diagnostic, "receive", now) ||
    hasFreshReportedMediaObservation(diagnostic, "send", now) ||
    hasFreshReportedMediaObservation(diagnostic, "receive", now);
}

export function hasRecentMediaSample(
  diagnostic: PeerDiagnosticsSnapshot | null | undefined,
  now = Date.now()
) {
  const sampleAgeMs = getMediaSampleAgeMs(diagnostic, now);
  return sampleAgeMs !== null && sampleAgeMs <= realtimeMediaSampleWindowMs;
}

function getTimestampMs(value: string) {
  return new Date(value).getTime();
}
