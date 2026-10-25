import { describe, expect, it } from "vitest";
import { segmentedPlaybackStatusSchema } from "./models";

describe("segmented playback diagnostics", () => {
  it("accepts stable media session metrics", () => {
    const result = segmentedPlaybackStatusSchema.safeParse({
      playbackAssetId: "asset_1",
      mediaSessionKey: "track_1|asset_1|1|2|start|peer_a|none",
      sourcePeerId: "peer_a",
      isSourceOwner: true,
      listenerPlaybackState: "live",
      sourceStartState: "live",
      audioContextState: "running",
      outputTrackId: "track_audio",
      remoteTrackId: null,
      bufferedAheadMs: 12_000,
      scheduledAheadMs: 20_000,
      underrunCount: 0,
      lastUnderrunAt: null,
      decodedPeak: 0.7,
      decodedRms: 0.1,
      lastDecodeError: null,
      mediaRecoveryState: null
    });

    expect(result.success).toBe(true);
  });
});
