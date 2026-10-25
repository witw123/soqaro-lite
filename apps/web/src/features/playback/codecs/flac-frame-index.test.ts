import { describe, expect, it } from "vitest";
import { scanFlacFrameOffsets } from "./flac-frame-index";

describe("flac frame index", () => {
  it("finds FLAC frame sync offsets after metadata blocks", () => {
    const bytes = new Uint8Array([
      0x66, 0x4c, 0x61, 0x43,
      0x80, 0x00, 0x00, 0x22,
      ...new Array(34).fill(0),
      0xff, 0xf8, 0x69, 0x18,
      0x00, 0x00, 0x00,
      0xff, 0xf9, 0x69, 0x18
    ]);

    expect(scanFlacFrameOffsets(bytes.buffer)).toEqual([42, 49]);
  });

  it("returns an empty index until the FLAC marker and first metadata block are available", () => {
    expect(scanFlacFrameOffsets(new Uint8Array([0x66, 0x4c]).buffer)).toEqual([]);
  });
});
