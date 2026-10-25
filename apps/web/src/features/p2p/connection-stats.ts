type StatsRecord = RTCStats & Record<string, unknown>;

export type PeerConnectionStatsSample = {
  candidateType: string | null;
  localCandidateType?: string | null;
  remoteCandidateType?: string | null;
  protocol: string | null;
  relayProtocol?: string | null;
  currentRoundTripTimeMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  transportReceiveBitrateKbps?: number | null;
  transportSendBitrateKbps?: number | null;
  connectionState?: string | null;
  iceConnectionState?: string | null;
  dataChannelState?: string | null;
  targetAudioBitrateKbps?: number | null;
  configuredAudioMaxBitrateKbps?: number | null;
  senderAudioMaxBitrateKbps?: number | null;
  opusFmtpLine?: string | null;
  senderTrackId?: string | null;
  receiverTrackId?: string | null;
  senderCodecId?: string | null;
  receiverCodecId?: string | null;
  opusCodec?: string | null;
  mediaTrackEstablishedAtMs?: number | null;
  lastMediaReceivePacketAtMs?: number | null;
  lastMediaSendPacketAtMs?: number | null;
  /** Backward-compatible aggregate timestamp used by diagnostics. */
  lastMediaPacketAtMs?: number | null;
  packetLossRate?: number | null;
  receiverJitterTargetMs?: number | null;
  mediaReceiveBitrateKbps: number | null;
  mediaSendBitrateKbps: number | null;
  packetsLost: number | null;
  jitterMs: number | null;
};

export type PeerConnectionStatsSnapshot = {
  inboundAudioBytes: number | null;
  inboundAudioTimestampMs: number | null;
  outboundAudioBytes: number | null;
  outboundAudioTimestampMs: number | null;
  packetsLost: number | null;
  packetsTotal: number | null;
  candidatePairBytesReceived?: number | null;
  candidatePairBytesSent?: number | null;
  candidatePairTimestampMs?: number | null;
};

export async function samplePeerConnectionStats(
  connection: RTCPeerConnection,
  previousSnapshot: PeerConnectionStatsSnapshot | null = null
): Promise<{ sample: PeerConnectionStatsSample; snapshot: PeerConnectionStatsSnapshot } | null> {
  try {
    const report = await connection.getStats();
    const statsById = new Map<string, StatsRecord>();

    report.forEach((stat) => {
      statsById.set(stat.id, stat as StatsRecord);
    });

    const selectedCandidatePair = findSelectedCandidatePair(statsById);
    const localCandidate = selectedCandidatePair
      ? getLinkedStat(statsById, selectedCandidatePair, "localCandidateId")
      : null;
    const remoteCandidate = selectedCandidatePair
      ? getLinkedStat(statsById, selectedCandidatePair, "remoteCandidateId")
      : null;
    const selectedPath = resolveSelectedCandidatePath({
      localCandidate,
      remoteCandidate
    });
    const candidatePairBytesReceived = getNumber(selectedCandidatePair, "bytesReceived");
    const candidatePairBytesSent = getNumber(selectedCandidatePair, "bytesSent");
    const candidatePairTimestampMs = getTimestampMs(selectedCandidatePair);
    const inboundAudio = findFirstStat(
      statsById,
      (stat) => stat.type === "inbound-rtp" && getString(stat, "kind") === "audio"
    );
    const outboundAudio = findFirstStat(
      statsById,
      (stat) => stat.type === "outbound-rtp" && getString(stat, "kind") === "audio"
    );
    const remoteInboundAudio = findFirstStat(
      statsById,
      (stat) => stat.type === "remote-inbound-rtp" && getString(stat, "kind") === "audio"
    );
    const inboundAudioBytes = getNumber(inboundAudio, "bytesReceived");
    const outboundAudioBytes = getNumber(outboundAudio, "bytesSent");
    const inboundAudioTimestampMs = getTimestampMs(inboundAudio);
    const outboundAudioTimestampMs = getTimestampMs(outboundAudio);
    const lastMediaReceivePacketAtMs = getNumber(
      inboundAudio,
      "lastPacketReceivedTimestamp"
    );
    const lastMediaSendPacketAtMs = getNumber(
      outboundAudio,
      "lastPacketSentTimestamp"
    );
    const lossCounters =
      resolvePacketLossCounters(inboundAudio, remoteInboundAudio, outboundAudio) ?? null;
    const packetLossRate = calculatePacketLossRate({
      currentLost: lossCounters?.lost ?? null,
      currentTotal: lossCounters?.total ?? null,
      previousLost: previousSnapshot?.packetsLost ?? null,
      previousTotal: previousSnapshot?.packetsTotal ?? null
    });

    return {
      sample: {
        candidateType: selectedPath.candidateType,
        localCandidateType: selectedPath.localCandidateType,
        remoteCandidateType: selectedPath.remoteCandidateType,
        protocol: selectedPath.protocol,
        relayProtocol: selectedPath.relayProtocol,
        currentRoundTripTimeMs:
          toMilliseconds(getNumber(remoteInboundAudio, "roundTripTime")) ??
          toMilliseconds(getNumber(selectedCandidatePair, "currentRoundTripTime")),
        availableOutgoingBitrateKbps: toKbps(
          getNumber(selectedCandidatePair, "availableOutgoingBitrate")
        ),
        transportReceiveBitrateKbps: toBitrateKbps({
          currentBytes: candidatePairBytesReceived,
          currentTimestampMs: candidatePairTimestampMs,
          previousBytes: previousSnapshot?.candidatePairBytesReceived ?? null,
          previousTimestampMs: previousSnapshot?.candidatePairTimestampMs ?? null
        }),
        transportSendBitrateKbps: toBitrateKbps({
          currentBytes: candidatePairBytesSent,
          currentTimestampMs: candidatePairTimestampMs,
          previousBytes: previousSnapshot?.candidatePairBytesSent ?? null,
          previousTimestampMs: previousSnapshot?.candidatePairTimestampMs ?? null
        }),
        connectionState: getConnectionState(connection),
        iceConnectionState: getIceConnectionState(connection),
        dataChannelState: null,
        mediaReceiveBitrateKbps: toBitrateKbps({
          currentBytes: inboundAudioBytes,
          currentTimestampMs: inboundAudioTimestampMs,
          previousBytes: previousSnapshot?.inboundAudioBytes ?? null,
          previousTimestampMs: previousSnapshot?.inboundAudioTimestampMs ?? null
        }),
        mediaSendBitrateKbps: toBitrateKbps({
          currentBytes: outboundAudioBytes,
          currentTimestampMs: outboundAudioTimestampMs,
          previousBytes: previousSnapshot?.outboundAudioBytes ?? null,
          previousTimestampMs: previousSnapshot?.outboundAudioTimestampMs ?? null
        }),
        senderTrackId: getString(outboundAudio, "trackId"),
        receiverTrackId:
          getString(inboundAudio, "trackIdentifier") ?? getString(inboundAudio, "trackId"),
        senderCodecId: getString(outboundAudio, "codecId"),
        receiverCodecId: getString(inboundAudio, "codecId"),
        opusCodec: resolveOpusCodec(statsById, inboundAudio, outboundAudio),
        opusFmtpLine: resolveOpusFmtpLine(statsById, inboundAudio, outboundAudio),
        targetAudioBitrateKbps: toKbps(getNumber(outboundAudio, "targetBitrate")),
        senderAudioMaxBitrateKbps: toKbps(getNumber(outboundAudio, "maxBitrate")),
        mediaTrackEstablishedAtMs: resolveMediaTrackEstablishedAtMs(inboundAudio, outboundAudio),
        lastMediaReceivePacketAtMs,
        lastMediaSendPacketAtMs,
        lastMediaPacketAtMs: lastMediaReceivePacketAtMs ?? lastMediaSendPacketAtMs,
        packetsLost: lossCounters?.lost ?? null,
        packetLossRate,
        jitterMs: toMilliseconds(getNumber(inboundAudio, "jitter"))
      },
      snapshot: {
        inboundAudioBytes,
        inboundAudioTimestampMs,
        outboundAudioBytes,
        outboundAudioTimestampMs,
        packetsLost: lossCounters?.lost ?? null,
        packetsTotal: lossCounters?.total ?? null,
        candidatePairBytesReceived,
        candidatePairBytesSent,
        candidatePairTimestampMs
      }
    };
  } catch {
    return null;
  }
}

function resolveSelectedCandidatePath(input: {
  localCandidate: StatsRecord | null;
  remoteCandidate: StatsRecord | null;
}) {
  const localCandidateType = getString(input.localCandidate, "candidateType");
  const remoteCandidateType = getString(input.remoteCandidate, "candidateType");
  const localRelayProtocol = getString(input.localCandidate, "relayProtocol");
  const remoteRelayProtocol = getString(input.remoteCandidate, "relayProtocol");
  const relayProtocol = localRelayProtocol ?? remoteRelayProtocol ?? null;
  const localProtocol = getString(input.localCandidate, "protocol");
  const remoteProtocol = getString(input.remoteCandidate, "protocol");
  const candidateType =
    localCandidateType === "relay" || remoteCandidateType === "relay"
      ? "relay"
      : localCandidateType ?? remoteCandidateType ?? null;
  const protocol = relayProtocol ?? localProtocol ?? remoteProtocol ?? null;

  return {
    candidateType,
    localCandidateType,
    remoteCandidateType,
    protocol,
    relayProtocol
  };
}

function getConnectionState(connection: RTCPeerConnection) {
  const state = connection.connectionState;
  return typeof state === "string" ? state : null;
}

function getIceConnectionState(connection: RTCPeerConnection) {
  const state = connection.iceConnectionState;
  return typeof state === "string" ? state : null;
}

function findSelectedCandidatePair(statsById: Map<string, StatsRecord>) {
  const transport = findFirstStat(
    statsById,
    (stat) =>
      stat.type === "transport" &&
      typeof getString(stat, "selectedCandidatePairId") === "string"
  );
  const selectedPairFromTransport = transport
    ? getLinkedStat(statsById, transport, "selectedCandidatePairId")
    : null;

  if (selectedPairFromTransport) {
    return selectedPairFromTransport;
  }

  return (
    findFirstStat(
      statsById,
      (stat) =>
        stat.type === "candidate-pair" &&
        (getBoolean(stat, "selected") ||
          getBoolean(stat, "nominated") ||
          getString(stat, "state") === "succeeded")
    ) ?? null
  );
}

function findFirstStat(
  statsById: Map<string, StatsRecord>,
  predicate: (stat: StatsRecord) => boolean
) {
  for (const stat of statsById.values()) {
    if (predicate(stat)) {
      return stat;
    }
  }

  return null;
}

function resolveCodecStat(
  statsById: Map<string, StatsRecord>,
  inboundAudio: StatsRecord | null,
  outboundAudio: StatsRecord | null
) {
  const codecId = getString(outboundAudio, "codecId") ?? getString(inboundAudio, "codecId");
  if (codecId) {
    const linked = statsById.get(codecId);
    if (linked) {
      return linked;
    }
  }
  return findFirstStat(
    statsById,
    (stat) => stat.type === "codec" && /^audio\/opus$/i.test(getString(stat, "mimeType") ?? "")
  );
}

function resolveOpusCodec(
  statsById: Map<string, StatsRecord>,
  inboundAudio: StatsRecord | null,
  outboundAudio: StatsRecord | null
) {
  return getString(resolveCodecStat(statsById, inboundAudio, outboundAudio), "mimeType");
}

function resolveOpusFmtpLine(
  statsById: Map<string, StatsRecord>,
  inboundAudio: StatsRecord | null,
  outboundAudio: StatsRecord | null
) {
  return getString(resolveCodecStat(statsById, inboundAudio, outboundAudio), "sdpFmtpLine");
}

function resolveMediaTrackEstablishedAtMs(
  inboundAudio: StatsRecord | null,
  outboundAudio: StatsRecord | null
) {
  return getNumber(inboundAudio, "firstPacketReceivedTimestamp") ??
    getNumber(outboundAudio, "firstPacketSentTimestamp") ??
    getTimestampMs(inboundAudio) ??
    getTimestampMs(outboundAudio);
}

function getLinkedStat(
  statsById: Map<string, StatsRecord>,
  source: StatsRecord,
  key: string
) {
  const linkedId = getString(source, key);
  return linkedId ? statsById.get(linkedId) ?? null : null;
}

function getString(stat: StatsRecord | null | undefined, key: string) {
  const value = stat?.[key];
  return typeof value === "string" ? value : null;
}

function getNumber(stat: StatsRecord | null | undefined, key: string) {
  const value = stat?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getInt(stat: StatsRecord | null | undefined, key: string) {
  const value = getNumber(stat, key);
  return value === null ? null : Math.round(value);
}

function getBoolean(stat: StatsRecord | null | undefined, key: string) {
  const value = stat?.[key];
  return typeof value === "boolean" ? value : false;
}

function getTimestampMs(stat: RTCStats | null | undefined) {
  return typeof stat?.timestamp === "number" && Number.isFinite(stat.timestamp)
    ? stat.timestamp
    : null;
}

function toMilliseconds(value: number | null) {
  return value === null ? null : Math.round(value * 1000);
}

function toKbps(value: number | null) {
  return value === null ? null : Math.round(value / 1000);
}

function toBitrateKbps(input: {
  currentBytes: number | null;
  currentTimestampMs: number | null;
  previousBytes: number | null;
  previousTimestampMs: number | null;
}) {
  if (
    input.currentBytes === null ||
    input.currentTimestampMs === null ||
    input.previousBytes === null ||
    input.previousTimestampMs === null
  ) {
    return null;
  }

  const byteDelta = input.currentBytes - input.previousBytes;
  const timeDeltaMs = input.currentTimestampMs - input.previousTimestampMs;
  if (byteDelta < 0 || timeDeltaMs <= 0) {
    return null;
  }

  return Math.round((byteDelta * 8) / timeDeltaMs);
}

function resolvePacketLossCounters(
  inboundAudio: StatsRecord | null,
  remoteInboundAudio: StatsRecord | null,
  outboundAudio: StatsRecord | null
) {
  const inboundLost = getInt(inboundAudio, "packetsLost");
  const inboundReceived = getInt(inboundAudio, "packetsReceived");
  if (inboundLost !== null && inboundReceived !== null) {
    return {
      lost: inboundLost,
      total: inboundLost + inboundReceived
    };
  }

  const remoteLost = getInt(remoteInboundAudio, "packetsLost");
  const remoteReceived =
    getInt(remoteInboundAudio, "packetsReceived") ?? getInt(outboundAudio, "packetsSent");
  if (remoteLost !== null && remoteReceived !== null) {
    return {
      lost: remoteLost,
      total: remoteLost + remoteReceived
    };
  }

  return null;
}

function calculatePacketLossRate(input: {
  currentLost: number | null;
  currentTotal: number | null;
  previousLost: number | null;
  previousTotal: number | null;
}) {
  if (
    input.currentLost === null ||
    input.currentTotal === null ||
    input.previousLost === null ||
    input.previousTotal === null
  ) {
    return null;
  }

  const lostDelta = input.currentLost - input.previousLost;
  const totalDelta = input.currentTotal - input.previousTotal;
  if (lostDelta < 0 || totalDelta <= 0) {
    return null;
  }

  return Math.round((Math.min(1, lostDelta / totalDelta) * 100) * 10) / 10;
}
