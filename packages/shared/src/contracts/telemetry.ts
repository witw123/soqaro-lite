import { z } from "zod";

export const telemetryPeerReportSchema = z.object({
  peerId: z.string().trim().min(1).max(160),
  updatedAt: z.string().datetime(),
  dataConnectionState: z.string().nullable(),
  mediaConnectionState: z.string().nullable(),
  mediaIceState: z.string().nullable(),
  dataIceState: z.string().nullable(),
  mediaCandidateType: z.string().nullable(),
  mediaProtocol: z.string().nullable(),
  rttMs: z.number().nonnegative().nullable(),
  sendBitrateKbps: z.number().nonnegative().nullable(),
  receiveBitrateKbps: z.number().nonnegative().nullable(),
  packetLossRate: z.number().nonnegative().nullable(),
  jitterMs: z.number().nonnegative().nullable(),
  mediaTrackState: z.enum(["none", "live", "ended", "failed"]).nullable(),
  bufferedAheadMs: z.number().int().nonnegative().nullable(),
  scheduledAheadMs: z.number().int().nonnegative().nullable(),
  underrunCount: z.number().int().nonnegative().nullable(),
  playbackBitrateKbps: z.number().nonnegative().nullable(),
  sourcePeerId: z.string().nullable(),
  playbackState: z.string().nullable(),
  audible: z.boolean().nullable().optional(),
  errorCode: z.string().trim().max(120).nullable()
}).strict();

export const telemetryReportSchema = z.object({
  protocolVersion: z.literal(1),
  roomId: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
  peerId: z.string().trim().min(1).max(160),
  reportedAt: z.string().datetime(),
  peers: z.array(telemetryPeerReportSchema).max(32)
}).strict();

export type TelemetryPeerReport = z.infer<typeof telemetryPeerReportSchema>;
export type TelemetryReport = z.infer<typeof telemetryReportSchema>;
