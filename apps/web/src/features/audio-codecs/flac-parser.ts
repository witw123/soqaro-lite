export type FlacStreamInfo = {
  description: Uint8Array;
  audioOffset: number;
  minBlockSize: number;
  maxBlockSize: number;
  sampleRate: number;
  numberOfChannels: number;
  bitsPerSample: number;
  totalSamples: number | null;
};

export type FlacFramePacket = {
  data: Uint8Array;
  sampleCount: number;
  timestampUs: number;
  durationUs: number;
};

export type FlacPacketExtraction = {
  streamInfo: FlacStreamInfo | null;
  packets: FlacFramePacket[];
  nextOffset: number;
  nextSampleIndex: number;
};

const flacStreamInfoLength = 34;

function createFlacDecoderDescription(streamInfoBlock: Uint8Array) {
  const description = new Uint8Array(8 + flacStreamInfoLength);
  description.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, flacStreamInfoLength]);
  description.set(streamInfoBlock.subarray(0, flacStreamInfoLength), 8);
  return description;
}

export function parseFlacStreamInfo(bytes: Uint8Array): FlacStreamInfo | null {
  if (bytes.byteLength < 8) {
    return null;
  }

  if (
    bytes[0] !== 0x66 ||
    bytes[1] !== 0x4c ||
    bytes[2] !== 0x61 ||
    bytes[3] !== 0x43
  ) {
    return null;
  }

  let cursor = 4;
  let streamInfoBlock: Uint8Array | null = null;

  while (cursor + 4 <= bytes.byteLength) {
    const header = bytes[cursor];
    const isLastBlock = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockLength =
      (bytes[cursor + 1] << 16) |
      (bytes[cursor + 2] << 8) |
      bytes[cursor + 3];
    const blockStart = cursor + 4;
    const blockEnd = blockStart + blockLength;

    if (blockEnd > bytes.byteLength) {
      // Audio frames start after the complete metadata chain. Scanning from a
      // partial PICTURE block can mistake embedded image bytes for FLAC sync.
      return null;
    }

    if (blockType === 0) {
      streamInfoBlock = bytes.slice(blockStart, blockEnd);
    }

    cursor = blockEnd;
    if (isLastBlock) {
      break;
    }
  }

  if (!streamInfoBlock || streamInfoBlock.byteLength !== flacStreamInfoLength) {
    return null;
  }

  const sampleRate =
    (streamInfoBlock[10] << 12) |
    (streamInfoBlock[11] << 4) |
    (streamInfoBlock[12] >> 4);
  const minBlockSize = (streamInfoBlock[0] << 8) | streamInfoBlock[1];
  const maxBlockSize = (streamInfoBlock[2] << 8) | streamInfoBlock[3];
  const numberOfChannels = ((streamInfoBlock[12] & 0x0e) >> 1) + 1;
  const bitsPerSample = (((streamInfoBlock[12] & 0x01) << 4) | (streamInfoBlock[13] >> 4)) + 1;
  const totalSamplesHigh = streamInfoBlock[13] & 0x0f;
  const totalSamplesLow =
    (streamInfoBlock[14] * 2 ** 24) |
    (streamInfoBlock[15] << 16) |
    (streamInfoBlock[16] << 8) |
    streamInfoBlock[17];
  const totalSamples = totalSamplesHigh * 2 ** 32 + totalSamplesLow;

  if (sampleRate <= 0 || numberOfChannels <= 0 || bitsPerSample <= 0) {
    return null;
  }

  return {
    // WebCodecs only needs STREAMINFO. Supplying album artwork and comments
    // made Chromium reject otherwise valid FLAC streams during flush.
    description: createFlacDecoderDescription(streamInfoBlock),
    audioOffset: cursor,
    minBlockSize,
    maxBlockSize,
    sampleRate,
    numberOfChannels,
    bitsPerSample,
    totalSamples: totalSamples > 0 ? totalSamples : null
  };
}

export function extractFlacPackets(input: {
  bytes: Uint8Array;
  startOffset: number;
  sampleRate: number;
  streamInfo?: FlacStreamInfo | null;
  nextSampleIndex: number;
  finalChunk: boolean;
}) {
  const { bytes, sampleRate, finalChunk } = input;
  const packets: FlacFramePacket[] = [];
  let cursor = Math.max(0, input.startOffset);
  let nextSampleIndex = Math.max(0, input.nextSampleIndex);

  let currentHeader = findNextFrameHeader(bytes, cursor);
  if (!currentHeader) {
    return {
      packets,
      nextOffset: cursor,
      nextSampleIndex
    };
  }

  while (currentHeader) {
    const nextHeader = findNextSequentialFrameHeader(
      bytes,
      currentHeader.offset + 2,
      currentHeader
    );
    // Only a CRC-valid, sequential frame header proves the current frame's
    // boundary. Payload bytes can contain 0xFFF8 and must never be used to cut
    // a packet; doing so feeds truncated frames to libFLAC and causes LOST_SYNC.
    if (!nextHeader && !finalChunk) {
      break;
    }

    const packetEnd = nextHeader?.offset ?? bytes.byteLength;
    if (packetEnd <= currentHeader.offset) {
      break;
    }

    const frameSampleIndex = resolveFrameSampleIndex(
      input.streamInfo,
      currentHeader,
      nextSampleIndex
    );
    const durationUs = Math.round((currentHeader.sampleCount / sampleRate) * 1_000_000);
    const timestampUs = Math.round((frameSampleIndex / sampleRate) * 1_000_000);
    packets.push({
      data: bytes.slice(currentHeader.offset, packetEnd),
      sampleCount: currentHeader.sampleCount,
      timestampUs,
      durationUs
    });
    nextSampleIndex = frameSampleIndex + currentHeader.sampleCount;
    cursor = packetEnd;
    currentHeader = nextHeader ?? null;
  }

  return {
    packets,
    nextOffset: cursor,
    nextSampleIndex
  };
}

function findNextSequentialFrameHeader(
  bytes: Uint8Array,
  startOffset: number,
  currentHeader: ParsedFlacFrameHeader
) {
  let searchOffset = Math.max(0, startOffset);
  while (searchOffset + 6 <= bytes.byteLength) {
    const candidate = findNextFrameHeader(bytes, searchOffset);
    if (!candidate) {
      return null;
    }

    const expectedCodedNumber = currentHeader.variableBlockSize
      ? currentHeader.codedNumber + currentHeader.sampleCount
      : currentHeader.codedNumber + 1;
    if (
      candidate.variableBlockSize === currentHeader.variableBlockSize &&
      candidate.codedNumber === expectedCodedNumber
    ) {
      return candidate;
    }
    searchOffset = candidate.offset + 2;
  }

  return null;
}

export function extractFlacPacketsFromBitstream(input: {
  bytes: Uint8Array;
  startOffset: number;
  nextSampleIndex: number;
  finalChunk: boolean;
}) {
  const streamInfo = parseFlacStreamInfo(input.bytes);
  if (!streamInfo) {
    return {
      streamInfo: null,
      packets: [],
      nextOffset: input.startOffset,
      nextSampleIndex: input.nextSampleIndex
    } satisfies FlacPacketExtraction;
  }

  const packetExtraction = extractFlacPackets({
    bytes: input.bytes,
    startOffset: Math.max(input.startOffset, streamInfo.audioOffset),
    sampleRate: streamInfo.sampleRate,
    streamInfo,
    nextSampleIndex: input.nextSampleIndex,
    finalChunk: input.finalChunk
  });

  return {
    streamInfo,
    packets: packetExtraction.packets,
    nextOffset: packetExtraction.nextOffset,
    nextSampleIndex: packetExtraction.nextSampleIndex
  } satisfies FlacPacketExtraction;
}

export function extractFlacPacketsFromWindow(input: {
  bytes: Uint8Array;
  streamInfo: FlacStreamInfo;
  absoluteStartOffset: number;
  finalChunk: boolean;
}) {
  const packetExtraction = extractFlacPackets({
    bytes: input.bytes,
    startOffset: 0,
    sampleRate: input.streamInfo.sampleRate,
    streamInfo: input.streamInfo,
    nextSampleIndex: 0,
    finalChunk: input.finalChunk
  });

  return {
    streamInfo: input.streamInfo,
    packets: packetExtraction.packets,
    nextOffset: input.absoluteStartOffset + packetExtraction.nextOffset,
    nextSampleIndex: packetExtraction.nextSampleIndex
  } satisfies FlacPacketExtraction;
}

type ParsedFlacFrameHeader = {
  offset: number;
  sampleCount: number;
  codedNumber: number;
  variableBlockSize: boolean;
};

function findNextFrameHeader(bytes: Uint8Array, startOffset: number): ParsedFlacFrameHeader | null {
  for (let offset = Math.max(0, startOffset); offset + 6 <= bytes.byteLength; offset += 1) {
    const header = parseFrameHeader(bytes, offset);
    if (header) {
      return header;
    }
  }

  return null;
}

function parseFrameHeader(bytes: Uint8Array, offset: number): ParsedFlacFrameHeader | null {
  if (offset + 6 > bytes.byteLength) {
    return null;
  }

  const firstByte = bytes[offset];
  const secondByte = bytes[offset + 1];
  if (firstByte !== 0xff || (secondByte & 0xfe) !== 0xf8) {
    return null;
  }

  const blockSizeCode = bytes[offset + 2] >> 4;
  const sampleRateCode = bytes[offset + 2] & 0x0f;
  const channelAssignment = bytes[offset + 3] >> 4;
  const sampleSizeCode = (bytes[offset + 3] >> 1) & 0x07;
  const reservedBit = bytes[offset + 3] & 0x01;

  if (
    blockSizeCode === 0 ||
    sampleRateCode === 0x0f ||
    channelAssignment > 10 ||
    sampleSizeCode === 0x03 ||
    reservedBit !== 0
  ) {
    return null;
  }

  let cursor = offset + 4;
  const codedNumber = parseUtf8LikeNumber(bytes, cursor);
  if (!codedNumber) {
    return null;
  }
  cursor += codedNumber.byteLength;

  const blockSize = decodeBlockSize(blockSizeCode, bytes, cursor);
  if (!blockSize) {
    return null;
  }
  cursor += blockSize.extraBytes;

  const sampleRateExtraBytes = getSampleRateExtraBytes(sampleRateCode);
  if (cursor + sampleRateExtraBytes >= bytes.byteLength) {
    return null;
  }
  cursor += sampleRateExtraBytes;

  const expectedCrc = bytes[cursor];
  const actualCrc = computeCrc8(bytes.subarray(offset, cursor));
  if (expectedCrc !== actualCrc) {
    return null;
  }

  return {
    offset,
    sampleCount: blockSize.sampleCount,
    codedNumber: codedNumber.value,
    variableBlockSize: (secondByte & 0x01) !== 0
  };
}

function parseUtf8LikeNumber(bytes: Uint8Array, offset: number) {
  if (offset >= bytes.byteLength) {
    return null;
  }

  const firstByte = bytes[offset];
  let byteLength = 0;
  if ((firstByte & 0x80) === 0x00) {
    byteLength = 1;
  } else if ((firstByte & 0xe0) === 0xc0) {
    byteLength = 2;
  } else if ((firstByte & 0xf0) === 0xe0) {
    byteLength = 3;
  } else if ((firstByte & 0xf8) === 0xf0) {
    byteLength = 4;
  } else if ((firstByte & 0xfc) === 0xf8) {
    byteLength = 5;
  } else if ((firstByte & 0xfe) === 0xfc) {
    byteLength = 6;
  } else if (firstByte === 0xfe) {
    byteLength = 7;
  } else {
    return null;
  }

  if (offset + byteLength > bytes.byteLength) {
    return null;
  }

  for (let index = 1; index < byteLength; index += 1) {
    if ((bytes[offset + index] & 0xc0) !== 0x80) {
      return null;
    }
  }

  let value = firstByte & ((1 << Math.max(0, 8 - byteLength - 1)) - 1);
  if (byteLength === 1) {
    value = firstByte;
  }
  for (let index = 1; index < byteLength; index += 1) {
    value = value * 64 + (bytes[offset + index] & 0x3f);
  }

  return { byteLength, value };
}

function resolveFrameSampleIndex(
  streamInfo: FlacStreamInfo | null | undefined,
  header: ParsedFlacFrameHeader,
  fallbackSampleIndex: number
) {
  if (!streamInfo) {
    return fallbackSampleIndex;
  }

  if (!header.variableBlockSize) {
    return header.codedNumber * header.sampleCount;
  }

  return header.codedNumber;
}

function decodeBlockSize(blockSizeCode: number, bytes: Uint8Array, offset: number) {
  if (blockSizeCode === 0) {
    return null;
  }

  if (blockSizeCode === 1) {
    return {
      sampleCount: 192,
      extraBytes: 0
    };
  }

  if (blockSizeCode >= 2 && blockSizeCode <= 5) {
    return {
      sampleCount: 576 << (blockSizeCode - 2),
      extraBytes: 0
    };
  }

  if (blockSizeCode === 6) {
    if (offset >= bytes.byteLength) {
      return null;
    }

    return {
      sampleCount: bytes[offset] + 1,
      extraBytes: 1
    };
  }

  if (blockSizeCode === 7) {
    if (offset + 1 >= bytes.byteLength) {
      return null;
    }

    return {
      sampleCount: ((bytes[offset] << 8) | bytes[offset + 1]) + 1,
      extraBytes: 2
    };
  }

  return {
    sampleCount: 256 << (blockSizeCode - 8),
    extraBytes: 0
  };
}

function getSampleRateExtraBytes(sampleRateCode: number) {
  if (sampleRateCode === 0x0c) {
    return 1;
  }

  if (sampleRateCode === 0x0d || sampleRateCode === 0x0e) {
    return 2;
  }

  return 0;
}

function computeCrc8(bytes: Uint8Array) {
  let crc = 0;

  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x80) !== 0) {
        crc = ((crc << 1) ^ 0x07) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }

  return crc;
}
