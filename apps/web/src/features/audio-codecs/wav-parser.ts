export type WavHeader = {
  format: "pcm" | "float";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataBytes: number;
  totalSamples: number;
};

export function parseWavHeader(input: ArrayBuffer | Uint8Array): WavHeader | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 44) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let audioFormat = 0;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let blockAlign = 0;
  let dataOffset = 0;
  let dataBytes = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId !== "data" && chunkDataOffset + chunkSize > bytes.byteLength) {
      break;
    }

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      blockAlign = view.getUint16(chunkDataOffset + 12, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (audioFormat === 0xfffe && chunkSize >= 40) {
        // WAVE_FORMAT_EXTENSIBLE stores the PCM/IEEE-float subtype in the
        // first two bytes of its 16-byte subformat GUID.
        audioFormat = view.getUint16(chunkDataOffset + 24, true);
      }
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataBytes = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
    if (offset > bytes.byteLength && chunkId === "data") {
      break;
    }
  }

  if (
    (audioFormat !== 1 && audioFormat !== 3) ||
    sampleRate <= 0 ||
    channels <= 0 ||
    bitsPerSample <= 0 ||
    blockAlign <= 0 ||
    dataOffset <= 0 ||
    dataBytes < 0
  ) {
    return null;
  }

  return {
    format: audioFormat === 3 ? "float" : "pcm",
    sampleRate,
    channels,
    bitsPerSample,
    blockAlign,
    dataOffset,
    dataBytes,
    totalSamples: Math.floor(dataBytes / blockAlign)
  };
}

export function resolveWavByteRangeForSamples(
  header: WavHeader,
  sampleStart: number,
  sampleEnd: number
) {
  const startSample = clampSample(sampleStart, header.totalSamples);
  const endSample = Math.max(startSample, clampSample(sampleEnd, header.totalSamples));
  return {
    startByte: header.dataOffset + startSample * header.blockAlign,
    endByte: header.dataOffset + endSample * header.blockAlign
  };
}

function clampSample(sample: number, totalSamples: number) {
  if (!Number.isFinite(sample)) {
    return 0;
  }

  return Math.min(totalSamples, Math.max(0, Math.floor(sample)));
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}
