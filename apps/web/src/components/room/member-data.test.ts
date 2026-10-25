import { describe, expect, it } from "vitest";
import { createPeerSnapshot } from "@/features/p2p/diagnostics";
import {
  dedupePeerDiagnostics,
  dedupeRoomMembers,
  formatMemberDuration,
  getMediaSampleAgeMs,
  getMemberDurationMs,
  hasFreshMediaObservation,
  hasFreshLocalMediaObservation,
  hasRecentMediaSample,
  resolveMemberConnectionStatus
} from "./member-data";

describe("member data normalization", () => {
  it("keeps one authoritative member record per member id", () => {
    const members = dedupeRoomMembers([
      {
        id: "member_1",
        nickname: "Member",
        role: "member",
        joinedAt: "2026-07-15T09:00:00.000Z",
        peerId: null,
        presenceState: "offline"
      },
      {
        id: "member_1",
        nickname: "Member",
        role: "member",
        joinedAt: "2026-07-15T09:00:00.000Z",
        peerId: "peer_1",
        presenceState: "online"
      }
    ]);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ peerId: "peer_1", presenceState: "online" });
  });

  it("calculates and formats the duration since a member joined", () => {
    const joinedAt = "2026-07-15T09:00:00.000Z";
    const now = Date.parse("2026-07-15T10:02:03.000Z");

    expect(getMemberDurationMs({ joinedAt }, now)).toBe(3_723_000);
    expect(formatMemberDuration(getMemberDurationMs({ joinedAt }, now))).toBe("01:02:03");
  });

  it("keeps invalid join timestamps safe for member cards", () => {
    expect(getMemberDurationMs({ joinedAt: "not-a-date" }, Date.now())).toBe(0);
    expect(formatMemberDuration(-1)).toBe("00:00:00");
  });

  it("keeps the newest diagnostic record per peer", () => {
    const older = createPeerSnapshot("peer_1", "2026-07-15T10:00:00.000Z");
    const newer = createPeerSnapshot("peer_1", "2026-07-15T10:00:01.000Z");

    expect(dedupePeerDiagnostics([older, newer])).toEqual([newer]);
  });

  it("only treats recent positive RTP progress as live media", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.mediaReceiveBitrateKbps = 192;
    diagnostic.lastMediaStatsProgressAt = "2026-07-15T10:00:08.000Z";

    expect(getMediaSampleAgeMs(diagnostic, now)).toBe(2_000);
    expect(hasRecentMediaSample(diagnostic, now)).toBe(true);
    expect(hasFreshMediaObservation(diagnostic, now)).toBe(true);

    diagnostic.lastMediaStatsProgressAt = "2026-07-15T10:00:00.000Z";
    expect(hasRecentMediaSample(diagnostic, now)).toBe(false);
    expect(hasFreshMediaObservation(diagnostic, now)).toBe(false);
  });

  it("keeps local RTP direction and freshness independent from remote telemetry", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.mediaReceiveBitrateKbps = 0;
    diagnostic.mediaSendBitrateKbps = 192;
    diagnostic.lastMediaStatsProgressAt = "2026-07-15T10:00:09.000Z";
    diagnostic.reportedReceiveRateKbps = 32;
    diagnostic.reportedTelemetryAt = "2026-07-15T10:00:09.000Z";

    expect(hasFreshLocalMediaObservation(diagnostic, "receive", now)).toBe(false);
    expect(hasFreshLocalMediaObservation(diagnostic, "send", now)).toBe(true);
    expect(resolveMemberConnectionStatus(diagnostic, now)).toMatchObject({
      mediaReady: true,
      localReceiveActive: false,
      localSendActive: true,
      reportedReceiveActive: true,
      dataReady: true,
      dataState: "open"
    });
  });

  it("does not retain a stale local positive rate as active media", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.mediaReceiveBitrateKbps = 192;
    diagnostic.lastMediaStatsProgressAt = "2026-07-15T09:59:59.000Z";

    expect(hasFreshLocalMediaObservation(diagnostic, "receive", now)).toBe(false);
    expect(resolveMemberConnectionStatus(diagnostic, now).localReceiveActive).toBe(false);
  });

  it("does not call a connected media transport audible without fresh RTP", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.mediaConnectionState = "connected";

    expect(resolveMemberConnectionStatus(diagnostic, now)).toMatchObject({
      mediaState: "connected",
      mediaReady: false,
      localReceiveActive: false,
      localSendActive: false
    });
  });

  it("does not keep a member connected after its media track ends", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.mediaConnectionState = "connected";
    diagnostic.mediaTrackState = "ended";

    expect(resolveMemberConnectionStatus(diagnostic, now)).toMatchObject({
      mediaTrackState: "ended",
      mediaReady: false
    });
  });

  it("does not treat a connecting data channel as ready from stale telemetry", () => {
    const now = Date.parse("2026-07-15T10:00:10.000Z");
    const diagnostic = createPeerSnapshot("peer_1", "2026-07-15T10:00:10.000Z");
    diagnostic.dataChannelState = "connecting";
    diagnostic.reportedReceiveRateKbps = 192;
    diagnostic.reportedTelemetryAt = "2026-07-15T10:00:09.000Z";

    expect(resolveMemberConnectionStatus(diagnostic, now).dataReady).toBe(false);
  });
});
