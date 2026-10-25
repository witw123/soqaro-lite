import { describe, expect, it } from "vitest";
import {
  buildRoomExitHref,
  shouldAcceptIncomingPeerSignalRecoveryGeneration,
  shouldStartRoomRealtimeRuntime
} from "./use-room-runtime";

describe("v4 room runtime helpers", () => {
  it("routes authenticated room exits to the workspace", () => {
    expect(buildRoomExitHref({
      activeSession: { userId: "user_1" },
      workspaceEntryHref: "/app",
      authEntryHref: "/auth"
    })).toBe("/app");
  });

  it("routes unauthenticated room exits through auth", () => {
    expect(buildRoomExitHref({
      activeSession: null,
      workspaceEntryHref: "/app",
      authEntryHref: "/auth"
    })).toBe("/auth");
  });

  it("starts realtime only after identity and ICE configuration are ready", () => {
    expect(shouldStartRoomRealtimeRuntime({
      roomId: "room_1",
      hydrated: true,
      iceConfigResolved: true,
      peerId: "peer_1"
    })).toBe(true);
    expect(shouldStartRoomRealtimeRuntime({
      roomId: "room_1",
      hydrated: true,
      iceConfigResolved: false,
      peerId: "peer_1"
    })).toBe(false);
  });

  it("rejects stale recovery-generation signals", () => {
    expect(shouldAcceptIncomingPeerSignalRecoveryGeneration({
      payloadRecoveryGeneration: 4,
      currentRecoveryGeneration: 5
    })).toBe(false);
    expect(shouldAcceptIncomingPeerSignalRecoveryGeneration({
      payloadRecoveryGeneration: 5,
      currentRecoveryGeneration: 5
    })).toBe(true);
  });
});
