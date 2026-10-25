"use client";

import { useCallback, useReducer, type SetStateAction } from "react";
import type {
  IceConfigResponse,
  RoomMediaConnectionState,
  RoomDirectoryItem,
  Playlist,
  RoomPlaybackReadinessPayload
} from "@soqaro/shared";
import type { PlaybackStartRequest } from "@/features/playback/playback-start-request";

type RoomRecoveryPhase =
  | "joining"
  | "resyncing"
  | "bootstrapping-data"
  | "steady";

type RoomRecoveryMode = "late-join" | "rejoin" | "steady";

export type RoomRecoveryState = {
  phase: RoomRecoveryPhase;
  mode: RoomRecoveryMode;
  generation: number | null;
  bootstrapStartedAt: string | null;
  bootstrapSourcePeerId: string | null;
  pendingSnapshot: boolean;
  pendingData: boolean;
  pendingMedia: boolean;
  listenerBootstrapAttempts: number | null;
};

export type RoomPageState = {
  activeDashboardTab: "library" | "search" | "local" | "members";
  playbackStartRequest: PlaybackStartRequest | null;
  roomRecoveryState: RoomRecoveryState;
  isDiagnosticsPanelOpen: boolean;
  isPageVisible: boolean;
  availableRooms: RoomDirectoryItem[];
  playlists: Playlist[];
  connectedPeers: string[];
  mediaConnectedPeers: string[];
  playbackReadiness: RoomPlaybackReadinessPayload[];
  suppressRoomRecovery: boolean;
  isRecoveringRoom: boolean;
  isNavigatingRoomExit: boolean;
  mediaConnectionState: RoomMediaConnectionState;
  iceConfig: IceConfigResponse | null;
  iceConfigResolved: boolean;
  schedulerMode: "normal" | "conservative" | "idle";
  volume: number;
  playerResetEpoch: number;
  bufferHealth: "healthy" | "low" | "critical";
  audioUnlocked: boolean;
  sourceStartState: "idle" | "awaiting-unlock" | "starting" | "live" | "failed";
  lastSourceStartError: string | null;
  audioBlockedOverlay: boolean;
};

type RoomPageStateKey = keyof RoomPageState;

type RoomPageStateAction = {
  [TKey in RoomPageStateKey]: {
    type: "set";
    key: TKey;
    value: SetStateAction<RoomPageState[TKey]>;
  };
}[RoomPageStateKey];

export function createInitialRoomPageState(input: {
  documentHidden: boolean;
  audioUnlocked?: boolean;
}): RoomPageState {
  return {
    activeDashboardTab: "library",
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
    isDiagnosticsPanelOpen: false,
    isPageVisible: !input.documentHidden,
    availableRooms: [],
    playlists: [],
    connectedPeers: [],
    mediaConnectedPeers: [],
    playbackReadiness: [],
    suppressRoomRecovery: false,
    isRecoveringRoom: false,
    isNavigatingRoomExit: false,
    mediaConnectionState: "idle",
    iceConfig: null,
    iceConfigResolved: false,
    schedulerMode: "normal",
    volume: 0.72,
    playerResetEpoch: 0,
    bufferHealth: "healthy",
    audioUnlocked: input.audioUnlocked ?? false,
    sourceStartState: "idle",
    lastSourceStartError: null,
    audioBlockedOverlay: false
  };
}

function resolveSetStateAction<TValue>(current: TValue, value: SetStateAction<TValue>) {
  return typeof value === "function" ? (value as (current: TValue) => TValue)(current) : value;
}

export function roomPageStateReducer(
  state: RoomPageState,
  action: RoomPageStateAction
): RoomPageState {
  const currentValue = state[action.key];
  const nextValue = resolveSetStateAction(
    currentValue,
    action.value as SetStateAction<typeof currentValue>
  );
  return Object.is(nextValue, currentValue)
    ? state
    : {
        ...state,
        [action.key]: nextValue
      };
}

export function useRoomPageState(input: { audioUnlocked?: boolean } = {}) {
  const [state, dispatch] = useReducer(
    roomPageStateReducer,
    undefined,
    () =>
      createInitialRoomPageState({
        documentHidden: typeof document !== "undefined" && document.hidden,
        audioUnlocked: input.audioUnlocked
      })
  );

  const setAvailableRooms = useCallback(
    (value: SetStateAction<RoomDirectoryItem[]>) =>
      dispatch({ type: "set", key: "availableRooms", value }),
    []
  );
  const setPlaylists = useCallback(
    (value: SetStateAction<Playlist[]>) => dispatch({ type: "set", key: "playlists", value }),
    []
  );
  const setConnectedPeers = useCallback(
    (value: SetStateAction<string[]>) => dispatch({ type: "set", key: "connectedPeers", value }),
    []
  );
  const setMediaConnectedPeers = useCallback(
    (value: SetStateAction<string[]>) =>
      dispatch({ type: "set", key: "mediaConnectedPeers", value }),
    []
  );
  const setSuppressRoomRecovery = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "suppressRoomRecovery", value }),
    []
  );
  const setIsRecoveringRoom = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "isRecoveringRoom", value }),
    []
  );
  const setIsNavigatingRoomExit = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "isNavigatingRoomExit", value }),
    []
  );
  const setMediaConnectionState = useCallback(
    (value: SetStateAction<RoomMediaConnectionState>) =>
      dispatch({ type: "set", key: "mediaConnectionState", value }),
    []
  );
  const setIceConfig = useCallback(
    (value: SetStateAction<IceConfigResponse | null>) =>
      dispatch({ type: "set", key: "iceConfig", value }),
    []
  );
  const setIceConfigResolved = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "iceConfigResolved", value }),
    []
  );
  const setActiveDashboardTab = useCallback(
    (value: SetStateAction<RoomPageState["activeDashboardTab"]>) =>
      dispatch({ type: "set", key: "activeDashboardTab", value }),
    []
  );
  const setPlaybackStartRequest = useCallback(
    (value: SetStateAction<PlaybackStartRequest | null>) =>
      dispatch({ type: "set", key: "playbackStartRequest", value }),
    []
  );
  const setRoomRecoveryState = useCallback(
    (value: SetStateAction<RoomRecoveryState>) =>
      dispatch({ type: "set", key: "roomRecoveryState", value }),
    []
  );
  const setIsDiagnosticsPanelOpen = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "isDiagnosticsPanelOpen", value }),
    []
  );
  const setIsPageVisible = useCallback(
    (value: SetStateAction<boolean>) => dispatch({ type: "set", key: "isPageVisible", value }),
    []
  );
  const setSchedulerMode = useCallback(
    (value: SetStateAction<RoomPageState["schedulerMode"]>) =>
      dispatch({ type: "set", key: "schedulerMode", value }),
    []
  );
  const setVolume = useCallback(
    (value: SetStateAction<number>) => dispatch({ type: "set", key: "volume", value }),
    []
  );
  const setPlaybackReadiness = useCallback(
    (value: SetStateAction<RoomPlaybackReadinessPayload[]>) =>
      dispatch({ type: "set", key: "playbackReadiness", value }),
    []
  );
  const setPlayerResetEpoch = useCallback(
    (value: SetStateAction<number>) => dispatch({ type: "set", key: "playerResetEpoch", value }),
    []
  );
  const setBufferHealth = useCallback(
    (value: SetStateAction<RoomPageState["bufferHealth"]>) =>
      dispatch({ type: "set", key: "bufferHealth", value }),
    []
  );
  const setAudioUnlocked = useCallback(
    (value: SetStateAction<boolean>) => dispatch({ type: "set", key: "audioUnlocked", value }),
    []
  );
  const setSourceStartState = useCallback(
    (value: SetStateAction<RoomPageState["sourceStartState"]>) =>
      dispatch({ type: "set", key: "sourceStartState", value }),
    []
  );
  const setLastSourceStartError = useCallback(
    (value: SetStateAction<string | null>) =>
      dispatch({ type: "set", key: "lastSourceStartError", value }),
    []
  );
  const setAudioBlockedOverlay = useCallback(
    (value: SetStateAction<boolean>) =>
      dispatch({ type: "set", key: "audioBlockedOverlay", value }),
    []
  );

  return {
    ...state,
    setAvailableRooms,
    setPlaylists,
    setConnectedPeers,
    setMediaConnectedPeers,
    setPlaybackReadiness,
    setSuppressRoomRecovery,
    setIsRecoveringRoom,
    setIsNavigatingRoomExit,
    setMediaConnectionState,
    setIceConfig,
    setIceConfigResolved,
    setActiveDashboardTab,
    setPlaybackStartRequest,
    setRoomRecoveryState,
    setIsDiagnosticsPanelOpen,
    setIsPageVisible,
    setSchedulerMode,
    setVolume,
    setPlayerResetEpoch,
    setBufferHealth,
    setAudioUnlocked,
    setSourceStartState,
    setLastSourceStartError,
    setAudioBlockedOverlay
  };
}
