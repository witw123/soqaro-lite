"use client";

import { useCallback, useRef } from "react";
import type { RoomSnapshot } from "@soqaro/shared";
import type { PeerDiagnosticRecorder } from "@/features/p2p/use-peer-diagnostics";
import { createPeerSnapshot } from "@/features/p2p/diagnostics";
import type { DataTransportStatsInput } from "./room-runtime-types";

export function formatDiagnosticsTimestamp(timestampMs: number | null) {
  return typeof timestampMs === "number" && Number.isFinite(timestampMs)
    ? new Date(timestampMs).toISOString()
    : null;
}

export function useRoomRuntimeObservability(input: {
  roomSnapshot: RoomSnapshot | null;
  peerId: string;
  recordPeerDiagnostic: PeerDiagnosticRecorder;
}) {
  const { recordPeerDiagnostic } = input;
  const peerBufferedAmountBytesRef = useRef<Map<string, number>>(new Map());

  const updatePeerBufferedAmountRef = useRef((peerId: string, bufferedAmountBytes: number) => {
    peerBufferedAmountBytesRef.current.set(peerId, bufferedAmountBytes);
    recordPeerDiagnostic({
      peerId,
      channelKind: "data",
      direction: "local",
      event: "data-buffered-amount",
      summary: `Data channel buffered ${bufferedAmountBytes} bytes`,
      recordEvent: false,
      update: (snapshot) => ({
        ...snapshot,
        bufferedAmountBytes
      })
    });
  });

  const updateDataTransportStatsRef = useRef((value: DataTransportStatsInput) => {
    const sample = value.sample;
    recordPeerDiagnostic({
      peerId: value.peerId,
      channelKind: "data",
      direction: "local",
      event: "data-transport-stats",
      summary: "Data transport stats updated",
      recordEvent: false,
      update: (snapshot) => ({
        ...snapshot,
        dataConnectionState: sample?.connectionState !== undefined
          ? sample.connectionState
          : snapshot.dataConnectionState,
        dataIceState: sample?.iceConnectionState !== undefined
          ? sample.iceConnectionState
          : snapshot.dataIceState,
        // RTCDataChannel.readyState is event-driven; the stats sampler emits
        // null for it and must not erase an observed open channel.
        dataChannelState: sample?.dataChannelState ?? snapshot.dataChannelState,
        dataCandidateType: sample ? sample.candidateType : snapshot.dataCandidateType,
        dataRemoteCandidateType: sample?.remoteCandidateType !== undefined
          ? sample.remoteCandidateType
          : snapshot.dataRemoteCandidateType,
        dataProtocol: sample?.protocol !== undefined ? sample.protocol : snapshot.dataProtocol,
        dataRelayProtocol: sample?.relayProtocol !== undefined
          ? sample.relayProtocol
          : snapshot.dataRelayProtocol,
        currentRoundTripTimeMs: sample
          ? sample.currentRoundTripTimeMs
          : snapshot.currentRoundTripTimeMs,
        availableOutgoingBitrateKbps: sample
          ? sample.availableOutgoingBitrateKbps
          : snapshot.availableOutgoingBitrateKbps,
        transportReceiveBitrateKbps: sample?.transportReceiveBitrateKbps !== undefined
          ? sample.transportReceiveBitrateKbps
          : snapshot.transportReceiveBitrateKbps,
        transportSendBitrateKbps: sample?.transportSendBitrateKbps !== undefined
          ? sample.transportSendBitrateKbps
          : snapshot.transportSendBitrateKbps,
        packetsLost: sample ? sample.packetsLost : snapshot.packetsLost,
        jitterMs: sample ? sample.jitterMs : snapshot.jitterMs,
        packetLossRate: sample ? sample.packetLossRate : snapshot.packetLossRate,
        targetAudioBitrateKbps: snapshot.targetAudioBitrateKbps
      })
    });
  });

  const updateMediaTransportStatsRef = useRef((value: DataTransportStatsInput) => {
    const sample = value.sample;
    recordPeerDiagnostic({
      peerId: value.peerId,
      channelKind: "media",
      direction: "local",
      event: "media-transport-stats",
      summary: "Media RTP stats updated",
      recordEvent: false,
      update: (snapshot) => ({
        ...snapshot,
        ...(value.sample && value.sample.mediaReceiveBitrateKbps !== null &&
        value.sample.mediaReceiveBitrateKbps > 0
          ? {
              lastAudibleProgressAt: new Date().toISOString(),
              lastMediaStatsProgressAt: new Date().toISOString()
            }
          : value.sample && value.sample.mediaSendBitrateKbps !== null &&
              value.sample.mediaSendBitrateKbps > 0
            ? { lastMediaStatsProgressAt: new Date().toISOString() }
            : {}),
        mediaConnectionState: sample?.connectionState !== undefined
          ? sample.connectionState
          : snapshot.mediaConnectionState,
        mediaIceState: sample?.iceConnectionState !== undefined
          ? sample.iceConnectionState
          : snapshot.mediaIceState,
        mediaCandidateType: sample ? sample.candidateType : snapshot.mediaCandidateType,
        mediaProtocol: sample?.protocol !== undefined ? sample.protocol : snapshot.mediaProtocol,
        currentRoundTripTimeMs: sample
          ? sample.currentRoundTripTimeMs
          : snapshot.currentRoundTripTimeMs,
        // A nullable RTP rate is an explicit current sample. Retaining the
        // previous positive value makes a stopped stream look alive.
        mediaReceiveBitrateKbps: sample
          ? sample.mediaReceiveBitrateKbps
          : snapshot.mediaReceiveBitrateKbps,
        mediaSendBitrateKbps: sample
          ? sample.mediaSendBitrateKbps
          : snapshot.mediaSendBitrateKbps,
        targetAudioBitrateKbps: sample?.targetAudioBitrateKbps !== undefined
          ? sample.targetAudioBitrateKbps
          : snapshot.targetAudioBitrateKbps,
        configuredAudioMaxBitrateKbps: sample?.configuredAudioMaxBitrateKbps !== undefined
          ? sample.configuredAudioMaxBitrateKbps
          : snapshot.configuredAudioMaxBitrateKbps,
        senderAudioMaxBitrateKbps: sample?.senderAudioMaxBitrateKbps !== undefined
          ? sample.senderAudioMaxBitrateKbps
          : snapshot.senderAudioMaxBitrateKbps,
        opusFmtpLine: sample?.opusFmtpLine !== undefined
          ? sample.opusFmtpLine
          : snapshot.opusFmtpLine,
        senderTrackId: sample?.senderTrackId !== undefined
          ? sample.senderTrackId
          : snapshot.senderTrackId,
        receiverTrackId: sample?.receiverTrackId !== undefined
          ? sample.receiverTrackId
          : snapshot.receiverTrackId,
        senderCodecId: sample?.senderCodecId !== undefined
          ? sample.senderCodecId
          : snapshot.senderCodecId,
        receiverCodecId: sample?.receiverCodecId !== undefined
          ? sample.receiverCodecId
          : snapshot.receiverCodecId,
        opusCodec: sample?.opusCodec !== undefined ? sample.opusCodec : snapshot.opusCodec,
        mediaTrackEstablishedAt:
          sample?.mediaTrackEstablishedAtMs !== undefined
            ? formatDiagnosticsTimestamp(sample.mediaTrackEstablishedAtMs)
            : snapshot.mediaTrackEstablishedAt,
        lastMediaPacketAt:
          sample?.lastMediaPacketAtMs !== undefined
            ? formatDiagnosticsTimestamp(sample.lastMediaPacketAtMs)
            : snapshot.lastMediaPacketAt,
        packetsLost: sample ? sample.packetsLost : snapshot.packetsLost,
        packetLossRate: sample ? sample.packetLossRate : snapshot.packetLossRate,
        jitterMs: sample ? sample.jitterMs : snapshot.jitterMs
      })
    });
  });

  const reportRealtimeFailureRef = useRef(
    (value: {
      peerId: string;
      channelKind: "data" | "system";
      event: string;
      summary: string;
      error?: unknown;
    }) => {
      recordPeerDiagnostic({
        peerId: value.peerId,
        channelKind: value.channelKind,
        direction: "local",
        event: value.event,
        summary: value.summary,
        level: "error",
        update: (snapshot) => ({
          ...snapshot,
          lastError: value.error ? String(value.error) : value.summary
        })
      });
    }
  );

  const updateSystemSegmentedStatus = useCallback(
    (patch: Record<string, unknown>) => {
      recordPeerDiagnostic({
        peerId: "system",
        channelKind: "system",
        direction: "local",
        event: "runtime-status",
        summary: "Segmented Opus runtime status updated",
        recordEvent: false,
        update: (snapshot) => ({
          ...snapshot,
          segmentedPlaybackStatus: {
            ...(
              snapshot.segmentedPlaybackStatus ??
              createPeerSnapshot(snapshot.peerId, snapshot.updatedAt).segmentedPlaybackStatus!
            ),
            ...patch
          }
        })
      });
    },
    [recordPeerDiagnostic]
  );

  return {
    peerBufferedAmountBytesRef,
    updateDataTransportStatsRef,
    updateMediaTransportStatsRef,
    reportRealtimeFailureRef,
    updatePeerBufferedAmountRef,
    updateSystemSegmentedStatus
  };
}
