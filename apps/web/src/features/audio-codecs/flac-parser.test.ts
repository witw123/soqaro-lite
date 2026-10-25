import { describe, expect, it } from "vitest";
import {
  extractFlacPacketsFromWindow,
  extractFlacPacketsFromBitstream,
  parseFlacStreamInfo
} from "./flac-parser";

describe("FLAC parser helpers", () => {
  it("parses streaminfo and splits contiguous FLAC frames", () => {
    const streamInfoPayload = new Uint8Array(34);
    streamInfoPayload[0] = 0x10;
    streamInfoPayload[1] = 0x00;
    streamInfoPayload[2] = 0x10;
    streamInfoPayload[3] = 0x00;
    streamInfoPayload[10] = 0x0a;
    streamInfoPayload[11] = 0xc4;
    streamInfoPayload[12] = 0x42;
    streamInfoPayload[13] = 0xf0;
    streamInfoPayload[14] = 0x00;
    streamInfoPayload[15] = 0x00;
    streamInfoPayload[16] = 0x20;
    streamInfoPayload[17] = 0x00;

    const description = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...streamInfoPayload
    ]);
    const frameA = buildFlacFrame(0, [0x11, 0x22, 0x33, 0x00, 0x00]);
    const frameB = buildFlacFrame(1, [0x44, 0x55, 0x66, 0x00, 0x00]);
    const bitstream = new Uint8Array([...description, ...frameA, ...frameB]);

    const streamInfo = parseFlacStreamInfo(bitstream);
    expect(streamInfo).toMatchObject({
      audioOffset: description.length,
      sampleRate: 44_100,
      numberOfChannels: 2,
      bitsPerSample: 16
    });

    const packetExtraction = extractFlacPacketsFromBitstream({
      bytes: bitstream,
      startOffset: 0,
      nextSampleIndex: 0,
      finalChunk: true
    });

    expect(packetExtraction.streamInfo?.audioOffset).toBe(description.length);
    expect(packetExtraction.packets).toHaveLength(2);
    expect(packetExtraction.packets[0]?.sampleCount).toBe(256);
    expect(packetExtraction.packets[1]?.timestampUs).toBe(
      Math.round((256 / 44_100) * 1_000_000)
    );
    expect(packetExtraction.nextOffset).toBe(bitstream.length);
    expect(packetExtraction.nextSampleIndex).toBe(512);
  });

  it("keeps frames pending until the next complete header can be validated", () => {
    const streamInfoPayload = new Uint8Array(34);
    streamInfoPayload[10] = 0x0a;
    streamInfoPayload[11] = 0xc4;
    streamInfoPayload[12] = 0x42;
    streamInfoPayload[13] = 0xf0;
    const description = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...streamInfoPayload
    ]);
    const frameA = buildFlacFrame(0, [0x10, 0x11, 0x12, 0x00, 0x00]);
    const partialFrameB = buildFlacFrame(1, [0x20, 0x21]).slice(0, 5);
    const bitstream = new Uint8Array([...description, ...frameA, ...partialFrameB]);

    const packetExtraction = extractFlacPacketsFromBitstream({
      bytes: bitstream,
      startOffset: description.length,
      nextSampleIndex: 0,
      finalChunk: false
    });

    expect(packetExtraction.packets).toHaveLength(0);
    expect(packetExtraction.nextOffset).toBe(description.length);
    expect(packetExtraction.nextSampleIndex).toBe(0);
  });

  it("does not truncate a frame at an unverified sync-like payload sequence", () => {
    const description = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...createStreamInfoPayload()
    ]);
    const frame = buildFlacFrame(0, [0x11, 0xff, 0xf8, 0x22, 0x33]);

    const extraction = extractFlacPacketsFromBitstream({
      bytes: new Uint8Array([...description, ...frame]),
      startOffset: description.length,
      nextSampleIndex: 0,
      finalChunk: false
    });

    expect(extraction.packets).toHaveLength(0);
    expect(extraction.nextOffset).toBe(description.length);
  });

  it("ignores CRC-valid sync-like bytes whose frame number is not sequential", () => {
    const description = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...createStreamInfoPayload()
    ]);
    const falseHeader = buildFlacFrame(9, [0x55, 0x66]);
    const frameA = buildFlacFrame(0, [0x11, ...falseHeader, 0x22, 0x33]);
    const frameB = buildFlacFrame(1, [0x44, 0x55, 0x66]);
    const bitstream = new Uint8Array([...description, ...frameA, ...frameB]);

    const extraction = extractFlacPacketsFromBitstream({
      bytes: bitstream,
      startOffset: description.length,
      nextSampleIndex: 0,
      finalChunk: true
    });

    expect(extraction.packets).toHaveLength(2);
    expect(extraction.packets[0]?.data).toEqual(frameA);
    expect(extraction.packets[1]?.data).toEqual(frameB);
  });

  it("waits for the complete FLAC metadata chain before scanning audio frames", () => {
    const streamInfoPayload = createStreamInfoPayload();
    const partialPicture = new Uint8Array([
      0x86, 0x00, 0x00, 0x10,
      0xff, 0xf8, 0x80, 0x10
    ]);
    const partialMetadata = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x00, 0x00, 0x00, 0x22,
      ...streamInfoPayload,
      ...partialPicture
    ]);

    expect(parseFlacStreamInfo(partialMetadata)).toBeNull();
    expect(
      extractFlacPacketsFromBitstream({
        bytes: partialMetadata,
        startOffset: 0,
        nextSampleIndex: 0,
        finalChunk: false
      })
    ).toMatchObject({
      streamInfo: null,
      packets: []
    });
  });

  it("uses a canonical STREAMINFO description when large metadata is complete", () => {
    const streamInfoPayload = createStreamInfoPayload();
    const picturePayload = new Uint8Array(4_096).fill(0x5a);
    const metadata = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x00, 0x00, 0x00, 0x22,
      ...streamInfoPayload,
      0x86,
      (picturePayload.byteLength >> 16) & 0xff,
      (picturePayload.byteLength >> 8) & 0xff,
      picturePayload.byteLength & 0xff,
      ...picturePayload
    ]);
    const frame = buildFlacFrame(0, [0x11, 0x22, 0x33]);
    const streamInfo = parseFlacStreamInfo(new Uint8Array([...metadata, ...frame]));

    expect(streamInfo?.audioOffset).toBe(metadata.byteLength);
    expect(streamInfo?.description).toEqual(
      new Uint8Array([
        0x66, 0x4c, 0x61, 0x43,
        0x80, 0x00, 0x00, 0x22,
        ...streamInfoPayload
      ])
    );
    expect(streamInfo?.description.byteLength).toBe(42);
  });

  it("extracts timestamped frames from an indexed playback window without requiring the full prefix", () => {
    const streamInfoPayload = new Uint8Array(34);
    streamInfoPayload[0] = 0x01;
    streamInfoPayload[1] = 0x00;
    streamInfoPayload[2] = 0x01;
    streamInfoPayload[3] = 0x00;
    streamInfoPayload[10] = 0x00;
    streamInfoPayload[11] = 0x10;
    streamInfoPayload[12] = 0x02;
    streamInfoPayload[13] = 0xf0;
    const description = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...streamInfoPayload
    ]);
    const streamInfo = parseFlacStreamInfo(description)!;
    const frame4 = buildFlacFrame(4, [0x40, 0x41, 0x42]);
    const frame5 = buildFlacFrame(5, [0x50, 0x51, 0x52]);

    const packetExtraction = extractFlacPacketsFromWindow({
      bytes: new Uint8Array([...frame4, ...frame5]),
      streamInfo,
      absoluteStartOffset: 256 * 1024 * 4,
      finalChunk: false
    });

    expect(packetExtraction.packets).toHaveLength(1);
    expect(packetExtraction.packets[0]?.timestampUs).toBe(4_000_000);
    expect(packetExtraction.packets[0]?.durationUs).toBe(1_000_000);
  });
});

function buildFlacFrame(frameNumber: number, bodyBytes: number[]) {
  const headerWithoutCrc = new Uint8Array([0xff, 0xf8, 0x80, 0x10, frameNumber & 0x7f]);
  const header = new Uint8Array([...headerWithoutCrc, computeCrc8(headerWithoutCrc)]);
  return new Uint8Array([...header, ...bodyBytes]);
}

function createStreamInfoPayload() {
  const streamInfoPayload = new Uint8Array(34);
  streamInfoPayload[0] = 0x10;
  streamInfoPayload[1] = 0x00;
  streamInfoPayload[2] = 0x10;
  streamInfoPayload[3] = 0x00;
  streamInfoPayload[10] = 0x0a;
  streamInfoPayload[11] = 0xc4;
  streamInfoPayload[12] = 0x42;
  streamInfoPayload[13] = 0xf0;
  return streamInfoPayload;
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
