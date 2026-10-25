import { describe, expect, it } from "vitest";
import {
  createInitialRoomPageState,
  roomPageStateReducer
} from "./use-room-page-state";

describe("roomPageStateReducer", () => {
  it("initializes browser visibility and default playback controls", () => {
    expect(createInitialRoomPageState({ documentHidden: true })).toMatchObject({
      activeDashboardTab: "library",
      audioUnlocked: false,
      bufferHealth: "healthy",
      connectedPeers: [],
      iceConfig: null,
      iceConfigResolved: false,
      isPageVisible: false,
      isRecoveringRoom: false,
      isNavigatingRoomExit: false,
      lastSourceStartError: null,
      mediaConnectedPeers: [],
      mediaConnectionState: "idle",
      playbackStartRequest: null,
      roomRecoveryState: {
        phase: "joining",
        mode: "steady",
        generation: null,
        bootstrapStartedAt: null,
        bootstrapSourcePeerId: null,
        pendingSnapshot: false,
        pendingData: false,
        pendingMedia: false,
        listenerBootstrapAttempts: null,
      },
      volume: 0.72,
      schedulerMode: "normal",
      playerResetEpoch: 0,
      audioBlockedOverlay: false,
      isDiagnosticsPanelOpen: false,
      sourceStartState: "idle",
      suppressRoomRecovery: false
    });
  });

  it("accepts direct values and updater functions like React setState", () => {
    const initial = createInitialRoomPageState({ documentHidden: false });
    const withEpoch = roomPageStateReducer(initial, {
      type: "set",
      key: "playerResetEpoch",
      value: 1
    });
    const withSameEpoch = roomPageStateReducer(withEpoch, {
      type: "set",
      key: "playerResetEpoch",
      value: (current) => (current === 1 ? current : 0)
    });

    expect(withSameEpoch).toBe(withEpoch);
    expect(withSameEpoch.playerResetEpoch).toBe(1);
  });

  it("updates runtime assembly state without losing other page state", () => {
    const initial = createInitialRoomPageState({ documentHidden: false });
    const withPeers = roomPageStateReducer(initial, {
      type: "set",
      key: "connectedPeers",
      value: ["peer_a"]
    });
    const withMorePeers = roomPageStateReducer(withPeers, {
      type: "set",
      key: "connectedPeers",
      value: (current) => [...current, "peer_b"]
    });
    const withRecovery = roomPageStateReducer(withMorePeers, {
      type: "set",
      key: "isRecoveringRoom",
      value: true
    });
    const withAudioError = roomPageStateReducer(withRecovery, {
      type: "set",
      key: "lastSourceStartError",
      value: "blocked"
    });

    expect(withMorePeers.connectedPeers).toEqual(["peer_a", "peer_b"]);
    expect(withAudioError).toMatchObject({
      isRecoveringRoom: true,
      lastSourceStartError: "blocked",
      volume: 0.72
    });
  });

  it("updates recovery state through the reducer", () => {
    const initial = createInitialRoomPageState({ documentHidden: false });
    const withRecovery = roomPageStateReducer(initial, {
      type: "set",
      key: "roomRecoveryState",
      value: (current) => ({
        ...current,
        phase: "steady",
      })
    });

    expect(withRecovery).toMatchObject({
      roomRecoveryState: {
        phase: "steady",
      }
    });
  });
});
