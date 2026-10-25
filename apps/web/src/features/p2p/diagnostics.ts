import type {
  PeerDiagnosticsSnapshot,
  PeerRecentEvent,
  PeerSignalStats,
  RemoteTrackStatus
} from "@soqaro/shared";

export type DiagnosticsState = {
  peers: Record<string, PeerDiagnosticsSnapshot>;
  recentEvents: PeerRecentEvent[];
};

type DiagnosticsInput = {
  peerId: string;
  channelKind: PeerRecentEvent["channelKind"];
  direction: PeerRecentEvent["direction"];
  event: string;
  summary: string;
  level?: PeerRecentEvent["level"];
  recordEvent?: boolean;
  update?: (snapshot: PeerDiagnosticsSnapshot) => PeerDiagnosticsSnapshot;
  now?: string;
};

const maxGlobalEvents = 100;
const maxPeerEvents = 12;

function isSameEventSignature(
  left: Pick<
    PeerRecentEvent,
    "peerId" | "channelKind" | "direction" | "event" | "summary" | "level"
  >,
  right: Pick<
    PeerRecentEvent,
    "peerId" | "channelKind" | "direction" | "event" | "summary" | "level"
  >
) {
  return (
    left.peerId === right.peerId &&
    left.channelKind === right.channelKind &&
    left.direction === right.direction &&
    left.event === right.event &&
    left.summary === right.summary &&
    left.level === right.level
  );
}

function upsertRecentEvent(
  events: PeerRecentEvent[],
  nextEvent: PeerRecentEvent,
  maxEvents: number
) {
  const currentTop = events[0];

  if (currentTop && isSameEventSignature(currentTop, nextEvent)) {
    return [nextEvent, ...events.slice(1)];
  }

  return [nextEvent, ...events].slice(0, maxEvents);
}

export function createEmptyDiagnosticsState(): DiagnosticsState {
  return {
    peers: {},
    recentEvents: []
  };
}

export function recordDiagnosticsEvent(
  state: DiagnosticsState,
  input: DiagnosticsInput
): DiagnosticsState {
  const timestamp = input.now ?? new Date().toISOString();
  const current = state.peers[input.peerId] ?? createPeerSnapshot(input.peerId, timestamp);
  const shouldRecordEvent = input.recordEvent ?? true;
  const event: PeerRecentEvent | null = shouldRecordEvent
    ? {
        id: `${timestamp}:${input.peerId}:${input.channelKind}:${input.event}:${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        peerId: input.peerId,
        channelKind: input.channelKind,
        direction: input.direction,
        event: input.event,
        summary: input.summary,
        level: input.level ?? "info"
      }
    : null;
  const baseUpdated: PeerDiagnosticsSnapshot = {
    ...current,
    updatedAt: timestamp,
    recentEvents: event
      ? upsertRecentEvent(current.recentEvents, event, maxPeerEvents)
      : current.recentEvents
  };
  const nextSnapshot = input.update ? input.update(baseUpdated) : baseUpdated;

  return {
    peers: {
      ...state.peers,
      [input.peerId]: nextSnapshot
    },
    recentEvents: event
      ? upsertRecentEvent(state.recentEvents, event, maxGlobalEvents)
      : state.recentEvents
  };
}

export function createEmptySignalStats(): PeerSignalStats {
  return {
    sentOffers: 0,
    receivedOffers: 0,
    sentAnswers: 0,
    receivedAnswers: 0,
    sentCandidates: 0,
    receivedCandidates: 0
  };
}

export function createEmptyRemoteTrackStatus(): RemoteTrackStatus {
  return {
    received: false,
    boundToAudioElement: false,
    lastTrackAt: null,
    lastBoundAt: null,
    lastAudioEvent: null,
    currentTrackId: null,
    mediaEpoch: null,
    sourcePeerId: null,
    traceKey: null,
    trackId: null,
    trackMuted: null,
    trackEnabled: null,
    trackReadyState: null,
    audioPaused: null,
    audioMuted: null,
    audioReadyState: null,
    hasSrcObject: null,
    currentSrc: null,
    audioVolume: null,
    lastPlayAttemptAt: null,
    lastPlayAttemptResult: null,
    lastPlayAttemptError: null,
    currentGeneration: null,
    boundGeneration: null,
    playingGeneration: null,
    recoveryStage: "idle",
    restartAttempt: null,
    publishGeneration: null,
    attachedTrackId: null,
    negotiatedTrackId: null,
    makingOffer: null,
    signalingState: null
  };
}

export function createPeerSnapshot(peerId: string, now = new Date().toISOString()): PeerDiagnosticsSnapshot {
  return {
    peerId,
    dataConnectionState: null,
    dataChannelState: null,
    mediaConnectionState: null,
    mediaTrackState: null,
    dataIceState: null,
    mediaIceState: null,
    transportHealth: null,
    transportScore: null,
    stableTransportKind: null,
    lastFailureReason: null,
    lastRecoveryAction: null,
    recoveryActionLevel: null,
    iceRestartCount: null,
    hardRecreateCount: null,
    degradedReason: null,
    iceConfigSource: null,
    dataCandidateType: null,
    dataRemoteCandidateType: null,
    dataProtocol: null,
    dataRelayProtocol: null,
    mediaCandidateType: null,
    mediaProtocol: null,
    currentRoundTripTimeMs: null,
    availableOutgoingBitrateKbps: null,
    transportReceiveBitrateKbps: null,
    transportSendBitrateKbps: null,
    targetAudioBitrateKbps: null,
    configuredAudioMaxBitrateKbps: null,
    senderAudioMaxBitrateKbps: null,
    opusFmtpLine: null,
    senderTrackId: null,
    receiverTrackId: null,
    senderCodecId: null,
    receiverCodecId: null,
    opusCodec: null,
    mediaTrackEstablishedAt: null,
    lastMediaPacketAt: null,
    packetLossRate: null,
    receiverJitterTargetMs: null,
    startupBufferMs: null,
    lastStablePlaybackAt: null,
    mediaReceiveBitrateKbps: null,
    mediaSendBitrateKbps: null,
    reportedSendRateKbps: null,
    reportedReceiveRateKbps: null,
    reportedTelemetryAt: null,
    reportedAudible: null,
    reportedAudibleAt: null,
    dataBufferedAmountBytes: null,
    lastAudibleProgressAt: null,
    lastMediaStatsProgressAt: null,
    lastDataActivityAt: null,
    playbackTransport: null,
    bufferingWhileAudible: false,
    recoverySuppressedReason: null,
    zeroProgressMs: null,
    consecutiveNoProgressMs: null,
    packetsLost: null,
    jitterMs: null,
    signalStats: createEmptySignalStats(),
    remoteTrackStatus: createEmptyRemoteTrackStatus(),
    segmentedPlaybackStatus: {
      playbackAssetId: null,
      mediaSessionKey: null,
      sourcePeerId: null,
      isSourceOwner: false,
      listenerPlaybackState: "idle",
      sourceStartState: "idle",
      audioContextState: null,
      outputTrackId: null,
      remoteTrackId: null,
      bufferedAheadMs: 0,
      scheduledAheadMs: 0,
      underrunCount: 0,
      lastUnderrunAt: null,
      decodedPeak: null,
      decodedRms: null,
      lastDecodeError: null,
      mediaRecoveryState: null
    },
    lastError: null,
    updatedAt: now,
    recentEvents: []
  };
}
