import type { TrackLoudness } from "@soqaro/shared";
import { analyzeAudioBuffer } from "@/features/library/loudness-analysis";

type LoudnessTrack = {
  loudness?: {
    gainDb?: number | null;
  } | null;
};

/**
 * Analyze a downloaded audio blob once so direct provider playback can use
 * the same normalization metadata as imported room tracks.
 */
export async function analyzeAudioBlobLoudness(blob: Blob): Promise<TrackLoudness | null> {
  if (typeof AudioContext === "undefined" || blob.size <= 0) {
    return null;
  }

  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return analyzeAudioBuffer(decoded);
  } catch {
    return null;
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/** Resolve the per-track gain used by the device-local loudness normalizer. */
export function resolveLoudnessGainDb(
  track: LoudnessTrack | null | undefined,
  enabled: boolean
) {
  if (!enabled) {
    return 0;
  }

  const gainDb = track?.loudness?.gainDb;
  return typeof gainDb === "number" && Number.isFinite(gainDb)
    ? Math.min(12, Math.max(-24, gainDb))
    : 0;
}
