import { z } from "zod";
import { originalAssetManifestSchema, playbackAssetManifestSchema } from "../assets/models";

export const neteaseTrackSourceRefSchema = z
  .object({
    provider: z.literal("netease"),
    trackId: z.string().trim().regex(/^\d+$/)
  })
  .strict();

export const qqMusicTrackSourceRefSchema = z
  .object({
    provider: z.literal("qqmusic"),
    trackId: z.string().trim().min(1).max(128)
  })
  .strict();

export const bilibiliTrackSourceRefSchema = z
  .object({
    provider: z.literal("bilibili"),
    trackId: z.string().trim().min(1)
  })
  .strict();

export const alistTrackSourceRefSchema = z
  .object({
    provider: z.literal("alist"),
    trackId: z.string().trim().min(1)
  })
  .strict();

export const remoteTrackSourceRefSchema = z.union([
  neteaseTrackSourceRefSchema,
  qqMusicTrackSourceRefSchema,
  bilibiliTrackSourceRefSchema,
  alistTrackSourceRefSchema
]);

export const trackSourceTypeSchema = z.enum([
  "local_upload",
  "netease",
  "qqmusic",
  "bilibili",
  "alist"
]);

export const trackLoudnessSchema = z.object({
  integratedLufs: z.number().finite().min(-70).max(0),
  truePeakDbtp: z.number().finite().min(-120).max(6),
  gainDb: z.number().finite().min(-24).max(12),
  targetLufs: z.literal(-14),
  version: z.literal(1)
}).strict();

export const trackMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  providerTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  lyrics: z.string().max(100_000).nullable().optional(),
  translatedLyrics: z.string().max(100_000).nullable().optional(),
  romanizedLyrics: z.string().max(100_000).nullable().optional(),
  durationMs: z.number().int().nonnegative(),
  bitrate: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  codec: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileHash: z.string(),
  artworkUrl: z.string().nullable(),
  ownerSessionId: z.string(),
  ownerNickname: z.string(),
  sourceType: trackSourceTypeSchema,
  sourceRef: remoteTrackSourceRefSchema.nullable().optional(),
  loudness: trackLoudnessSchema.optional(),
  originalAsset: originalAssetManifestSchema.optional(),
  playbackAsset: playbackAssetManifestSchema.optional()
}).superRefine((track, context) => {
  if (track.sourceType !== "local_upload" && !track.sourceRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceRef"],
      message: "Provider tracks require a source reference."
    });
  }

  if (track.sourceType === "local_upload" && track.sourceRef !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceRef"],
      message: "Local uploads cannot include a provider source reference."
    });
  }

  if (
    track.sourceType !== "local_upload" &&
    track.sourceRef &&
    track.sourceRef.provider !== track.sourceType
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceRef", "provider"],
      message: "Track source type and provider must match."
    });
  }
});

export const queueItemSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  requestedBy: z.string(),
  requestedById: z.string(),
  source: z.enum(["manual", "autopilot"]),
  sourceSeedTrackId: z.string().nullable(),
  position: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});

export const playlistSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  tags: z.array(z.string()),
  isCollaborative: z.boolean(),
  trackIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type TrackMeta = z.infer<typeof trackMetaSchema>;
export type TrackLoudness = z.infer<typeof trackLoudnessSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;
export type Playlist = z.infer<typeof playlistSchema>;

export type NeteaseTrackSourceRef = z.infer<typeof neteaseTrackSourceRefSchema>;
export type QqMusicTrackSourceRef = z.infer<typeof qqMusicTrackSourceRefSchema>;
export type RemoteTrackSourceRef = z.infer<typeof remoteTrackSourceRefSchema>;
export type TrackSourceType = z.infer<typeof trackSourceTypeSchema>;
