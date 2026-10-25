import type {
  RemoteTrackSourceRef,
  TrackSourceType
} from "@soqaro/shared";

export type ProviderTrackSourceInput = {
  sourceType?: TrackSourceType | null;
  sourceRef?: RemoteTrackSourceRef | null;
};

/**
 * Provider identity is the stable key for a downloaded track. Older local
 * records may still say `local_upload` while retaining their provider ref.
 */
export function resolveProviderTrackSource(
  input: ProviderTrackSourceInput | null | undefined
) {
  const sourceRef = input?.sourceRef;
  if (!sourceRef?.trackId?.trim()) {
    return null;
  }
  if (input?.sourceType === "local_upload" || input?.sourceType === sourceRef.provider) {
    return sourceRef;
  }
  return null;
}

