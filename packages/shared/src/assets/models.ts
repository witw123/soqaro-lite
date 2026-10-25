import { z } from "zod";

export const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const assetKindSchema = z.enum(["original", "playback"]);

export const playbackProfileId = "opus-music-v4" as const;
export const playbackEncoderVersion = "3.4.0" as const;

const assetManifestBaseSchema = z.object({
  assetId: sha256HexSchema,
  unitCount: z.number().int().positive().max(10_000),
  merkleRoot: sha256HexSchema
}).strict();

export const originalAssetManifestSchema = assetManifestBaseSchema.extend({
  kind: z.literal("original"),
  fileHash: sha256HexSchema,
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
  unitSize: z.literal(1024 * 1024)
});

const playbackAssetManifestShapeSchema = assetManifestBaseSchema.extend({
  kind: z.literal("playback"),
  sourceFileHash: sha256HexSchema,
  profileId: z.literal(playbackProfileId),
  codec: z.literal("opus"),
  container: z.literal("audio/ogg"),
  sampleRate: z.literal(48_000),
  channels: z.union([z.literal(1), z.literal(2)]),
  bitrate: z.union([z.literal(128_000), z.literal(256_000)]),
  durationMs: z.number().int().positive().max(3 * 60 * 60 * 1000),
  segmentDurationMs: z.literal(2_000),
  seekPrerollMs: z.literal(80),
  encoder: z.object({
    name: z.literal("@audio/opus-encode"),
    version: z.literal(playbackEncoderVersion)
  }).strict()
});

export const playbackAssetManifestSchema = playbackAssetManifestShapeSchema.superRefine((manifest, context) => {
  const expectedBitrate = manifest.channels === 1 ? 128_000 : 256_000;
  if (manifest.bitrate !== expectedBitrate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bitrate"],
      message: `Expected ${expectedBitrate} bps for ${manifest.channels} channel audio.`
    });
  }

  const expectedUnits = Math.ceil(manifest.durationMs / manifest.segmentDurationMs);
  if (manifest.unitCount !== expectedUnits) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unitCount"],
      message: `Expected ${expectedUnits} playback units for the declared duration.`
    });
  }
});

export const audioAssetManifestSchema = z.discriminatedUnion("kind", [
  originalAssetManifestSchema,
  // superRefine returns ZodEffects, so expose the playback shape to the union
  // and validate it with playbackAssetManifestSchema below.
  playbackAssetManifestShapeSchema
]).superRefine((manifest, context) => {
  if (manifest.kind !== "playback") {
    return;
  }
  const parsed = playbackAssetManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue(issue);
    }
    return;
  }
});

export const merkleProofNodeSchema = z.object({
  position: z.enum(["left", "right"]),
  hash: sha256HexSchema
}).strict();

export const assetUnitDescriptorSchema = z.object({
  assetId: sha256HexSchema,
  kind: assetKindSchema,
  unitIndex: z.number().int().nonnegative(),
  payloadBytes: z.number().int().positive(),
  contentHash: sha256HexSchema,
  proof: z.array(merkleProofNodeSchema).max(32),
  startMs: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().positive().optional(),
  trimStartSamples: z.number().int().nonnegative().optional(),
  trimEndSamples: z.number().int().nonnegative().optional()
}).strict().superRefine((unit, context) => {
  const hasPlaybackTiming =
    unit.startMs !== undefined &&
    unit.durationMs !== undefined &&
    unit.trimStartSamples !== undefined &&
    unit.trimEndSamples !== undefined;
  if (unit.kind === "playback" && !hasPlaybackTiming) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Playback units require timing and trim metadata."
    });
  }
});

export type OriginalAssetManifest = z.infer<typeof originalAssetManifestSchema>;
export type PlaybackAssetManifest = z.infer<typeof playbackAssetManifestSchema>;
export type AudioAssetManifest = z.infer<typeof audioAssetManifestSchema>;
export type AssetKind = z.infer<typeof assetKindSchema>;
export type MerkleProofNode = z.infer<typeof merkleProofNodeSchema>;
export type AssetUnitDescriptor = z.infer<typeof assetUnitDescriptorSchema>;
