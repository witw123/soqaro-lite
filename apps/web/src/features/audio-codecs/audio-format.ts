export function isLosslessTrack(input: { mimeType?: string | null; codec?: string | null }) {
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const codec = input.codec?.toLowerCase() ?? "";
  return (
    mimeType.includes("flac") ||
    mimeType.includes("wav") ||
    mimeType.includes("alac") ||
    codec.includes("flac") ||
    codec.includes("wav") ||
    codec.includes("alac")
  );
}

export function isFlacTrack(input: { mimeType?: string | null; codec?: string | null }) {
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const codec = input.codec?.toLowerCase() ?? "";
  return mimeType.includes("flac") || codec.includes("flac");
}

export function isWavTrack(input: { mimeType?: string | null; codec?: string | null }) {
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const codec = input.codec?.toLowerCase() ?? "";
  return (
    mimeType.includes("wav") ||
    mimeType.includes("wave") ||
    codec.includes("wav") ||
    codec.includes("wave")
  );
}
