export type Mp3FrameIndexEntry = {
  byteOffset: number;
  byteLength: number;
  sampleStart: number;
  sampleCount: number;
};

export type Mp3FrameIndex = {
  sampleRate: number;
  samplesPerFrame: number;
  frames: Mp3FrameIndexEntry[];
};

const mpeg1Layer3BitratesKbps = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0
];
const mpeg2Layer3BitratesKbps = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0
];
const mpeg1SampleRates = [44_100, 48_000, 32_000, 0];

export function scanMp3FrameIndex(input: ArrayBuffer | Uint8Array): Mp3FrameIndex {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const frames: Mp3FrameIndexEntry[] = [];
  let offset = skipMp3Id3v2(bytes);
  let sampleStart = 0;
  let sampleRate = 0;
  let samplesPerFrame = 1152;

  while (offset + 4 <= bytes.byteLength) {
    const header = parseMp3FrameHeader(bytes, offset);
    if (!header) {
      offset += 1;
      continue;
    }

    if (offset + header.frameLength > bytes.byteLength) {
      break;
    }

    sampleRate = header.sampleRate;
    samplesPerFrame = header.samplesPerFrame;
    frames.push({
      byteOffset: offset,
      byteLength: header.frameLength,
      sampleStart,
      sampleCount: header.samplesPerFrame
    });
    sampleStart += header.samplesPerFrame;
    offset += header.frameLength;
  }

  return {
    sampleRate,
    samplesPerFrame,
    frames
  };
}

export function parseMp3FrameHeader(bytes: Uint8Array, offset: number) {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (b1 >> 3) & 0b11;
  const layerBits = (b1 >> 1) & 0b11;
  const bitrateIndex = (b2 >> 4) & 0b1111;
  const sampleRateIndex = (b2 >> 2) & 0b11;
  const padding = (b2 >> 1) & 0b1;
  if (
    versionBits === 0b01 ||
    layerBits !== 0b01 ||
    bitrateIndex === 0 ||
    bitrateIndex === 0b1111 ||
    sampleRateIndex === 0b11
  ) {
    return null;
  }

  const isMpeg1 = versionBits === 0b11;
  const versionDivisor = isMpeg1 ? 1 : versionBits === 0b10 ? 2 : 4;
  const sampleRate = mpeg1SampleRates[sampleRateIndex] / versionDivisor;
  const bitrateKbps = (isMpeg1 ? mpeg1Layer3BitratesKbps : mpeg2Layer3BitratesKbps)[bitrateIndex];
  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const coefficient = isMpeg1 ? 144 : 72;
  const frameLength = Math.floor((coefficient * bitrateKbps * 1000) / sampleRate) + padding;
  if (!Number.isFinite(frameLength) || frameLength <= 4) {
    return null;
  }

  return {
    sampleRate,
    samplesPerFrame,
    frameLength,
    channels: ((bytes[offset + 3] >> 6) & 0x03) === 0x03 ? 1 : 2
  };
}

export function skipMp3Id3v2(bytes: Uint8Array) {
  if (
    bytes.byteLength < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return 0;
  }

  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  return 10 + size;
}
