import { describe, expect, it } from "vitest";
import { scanMp3FrameIndex } from "./mp3-frame-index";

function makeMpeg1Layer3Header(input: { bitrateKbps: number; sampleRate: number; padding?: boolean }) {
  const bitrateIndexByKbps: Record<number, number> = {
    32: 1,
    40: 2,
    48: 3,
    56: 4,
    64: 5,
    80: 6,
    96: 7,
    112: 8,
    128: 9,
    160: 10,
    192: 11,
    224: 12,
    256: 13,
    320: 14
  };
  const sampleRateIndexByHz: Record<number, number> = {
    44_100: 0,
    48_000: 1,
    32_000: 2
  };
  const bitrateIndex = bitrateIndexByKbps[input.bitrateKbps];
  const sampleRateIndex = sampleRateIndexByHz[input.sampleRate];
  return new Uint8Array([
    0xff,
    0xfb,
    (bitrateIndex << 4) | (sampleRateIndex << 2) | (input.padding ? 0b10 : 0),
    0x00
  ]);
}

describe("mp3 frame index", () => {
  it("finds MPEG frame boundaries and sample positions for original-quality MP3 playback", () => {
    const header = makeMpeg1Layer3Header({ bitrateKbps: 128, sampleRate: 44_100 });
    const frameLength = Math.floor(144 * 128_000 / 44_100);
    const bytes = new Uint8Array(frameLength * 2);
    bytes.set(header, 0);
    bytes.set(header, frameLength);

    expect(scanMp3FrameIndex(bytes.buffer)).toEqual({
      sampleRate: 44_100,
      samplesPerFrame: 1152,
      frames: [
        { byteOffset: 0, byteLength: frameLength, sampleStart: 0, sampleCount: 1152 },
        { byteOffset: frameLength, byteLength: frameLength, sampleStart: 1152, sampleCount: 1152 }
      ]
    });
  });
});
