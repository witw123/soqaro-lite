export function scanFlacFrameOffsets(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const audioStart = findFlacAudioDataOffset(bytes);
  if (audioStart === null) {
    return [] as number[];
  }

  const offsets: number[] = [];
  for (let offset = audioStart; offset + 1 < bytes.byteLength; offset += 1) {
    if (bytes[offset] === 0xff && (bytes[offset + 1] & 0xfe) === 0xf8) {
      offsets.push(offset);
    }
  }
  return offsets;
}

export function findFlacAudioDataOffset(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.byteLength < 8 ||
    bytes[0] !== 0x66 ||
    bytes[1] !== 0x4c ||
    bytes[2] !== 0x61 ||
    bytes[3] !== 0x43
  ) {
    return null;
  }

  let offset = 4;
  while (offset + 4 <= bytes.byteLength) {
    const header = bytes[offset];
    const isLast = (header & 0x80) !== 0;
    const length =
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const nextOffset = offset + 4 + length;
    if (nextOffset > bytes.byteLength) {
      return null;
    }
    offset = nextOffset;
    if (isLast) {
      return offset;
    }
  }

  return null;
}
