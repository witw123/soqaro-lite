import type { PlaybackAssetManifest } from "@soqaro/shared";

export const playbackPrefetchWindowMs = 16_000;

export function playbackUnitIndexAt(
  manifest: Pick<PlaybackAssetManifest, "segmentDurationMs" | "unitCount">,
  positionMs: number
) {
  return Math.min(
    manifest.unitCount - 1,
    Math.max(0, Math.floor(Math.max(0, positionMs) / manifest.segmentDurationMs))
  );
}

export function resolvePlaybackUnitOrder(input: {
  manifest: Pick<PlaybackAssetManifest, "segmentDurationMs" | "unitCount">;
  positionMs: number;
  ownedUnitIndexes: readonly number[];
  requestLimit?: number;
  prefetchWindowMs?: number;
}) {
  const current = playbackUnitIndexAt(input.manifest, input.positionMs);
  const owned = new Set(input.ownedUnitIndexes);
  const order: number[] = [];
  const windowEndMs = Math.max(0, input.positionMs) +
    Math.max(input.manifest.segmentDurationMs, input.prefetchWindowMs ?? playbackPrefetchWindowMs);
  const lastUnit = playbackUnitIndexAt(input.manifest, Math.max(input.positionMs, windowEndMs - 1));
  for (let index = current; index <= lastUnit; index += 1) {
    if (!owned.has(index)) {
      order.push(index);
    }
  }
  return order.slice(0, input.requestLimit ?? order.length);
}

export function contiguousPlaybackBufferMs(input: {
  manifest: Pick<PlaybackAssetManifest, "segmentDurationMs" | "unitCount" | "durationMs">;
  positionMs: number;
  ownedUnitIndexes: readonly number[];
}) {
  const current = playbackUnitIndexAt(input.manifest, input.positionMs);
  const owned = new Set(input.ownedUnitIndexes);
  let endExclusive = current;
  while (endExclusive < input.manifest.unitCount && owned.has(endExclusive)) {
    endExclusive += 1;
  }
  const bufferedEndMs = Math.min(
    input.manifest.durationMs,
    endExclusive * input.manifest.segmentDurationMs
  );
  return Math.max(0, bufferedEndMs - input.positionMs);
}

export function resolveStartupUnitIndexes(input: {
  manifest: Pick<PlaybackAssetManifest, "segmentDurationMs" | "unitCount">;
  positionMs: number;
  startupBufferMs?: number;
}) {
  const current = playbackUnitIndexAt(input.manifest, input.positionMs);
  const startupBufferMs = Math.max(input.manifest.segmentDurationMs, input.startupBufferMs ?? 0);
  const unitCount = Math.max(1, Math.ceil(startupBufferMs / input.manifest.segmentDurationMs));
  return Array.from(
    { length: Math.min(unitCount, input.manifest.unitCount - current) },
    (_, offset) => current + offset
  );
}
