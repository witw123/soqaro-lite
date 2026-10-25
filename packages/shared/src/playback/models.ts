import { z } from "zod";
import { sha256HexSchema } from "../assets/models";

export const playbackModeSchema = z.enum(["sequence", "shuffle", "single"]);
export type PlaybackMode = z.infer<typeof playbackModeSchema>;

export const gaplessTransitionSchema = z.object({
  trackId: z.string(),
  queueItemId: z.string().nullable(),
  playbackAssetId: sha256HexSchema,
  durationMs: z.number().int().positive(),
  transitionAt: z.string().datetime(),
  sourceSessionId: z.string(),
  sourcePeerId: z.string().nullable()
}).strict();

export type GaplessTransition = z.infer<typeof gaplessTransitionSchema>;

// Server-authoritative statuses are "playing" | "paused".
// "buffering" remains accepted for backward-compatible clients but is not written by the server.
export const playbackSnapshotSchema = z.object({
  status: z.enum(["playing", "paused", "buffering"]),
  currentTrackId: z.string().nullable(),
  currentQueueItemId: z.string().nullable(),
  playbackAssetId: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  sourceSessionId: z.string().nullable(),
  sourcePeerId: z.string().nullable(),
  sourceTrackId: z.string().nullable(),
  positionMs: z.number().int().nonnegative(),
  startedAt: z.string().datetime().nullable(),
  queueVersion: z.number().int().positive(),
  playbackRevision: z.number().int().positive().default(1),
  mediaEpoch: z.number().int().nonnegative(),
  // Optional for snapshots persisted before room-level playback order was added.
  playbackMode: playbackModeSchema.optional(),
  // Remaining unique track ids in the current pseudo-random playback cycle.
  shuffleBagTrackIds: z.array(z.string()).optional(),
  // Queue item selected to play immediately after the current item without
  // changing the queue's displayed order.
  nextQueueItemId: z.string().nullable().optional(),
  // The source can schedule this track before the server promotes it.
  gaplessNext: gaplessTransitionSchema.nullable().optional()
});

export type PlaybackSnapshot = z.infer<typeof playbackSnapshotSchema>;
