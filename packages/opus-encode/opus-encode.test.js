import assert from "node:assert/strict";
import test from "node:test";
import createOpusEncoder from "./opus-encode.js";

test("encodes PCM without an external WASM asset", async () => {
  const encoder = await createOpusEncoder({
    sampleRate: 48_000,
    channels: 1,
    bitrate: 96,
    application: "audio"
  });

  try {
    const head = encoder.encode([new Float32Array(48_000 / 10)]);
    const tail = encoder.flush();
    const payload = new Uint8Array(head.byteLength + tail.byteLength);
    payload.set(head, 0);
    payload.set(tail, head.byteLength);
    assert.equal(new TextDecoder().decode(payload.subarray(0, 4)), "OggS");
    const opusHeadOffset = payload.findIndex((value, index) =>
      index + 8 <= payload.byteLength &&
      new TextDecoder().decode(payload.subarray(index, index + 8)) === "OpusHead"
    );
    assert.ok(opusHeadOffset >= 0);
    assert.equal(new DataView(payload.buffer).getUint16(opusHeadOffset + 10, true), 312);
  } finally {
    encoder.free();
  }
});

test("reuses the codec for independent Ogg units", async () => {
  const encoder = await createOpusEncoder({
    sampleRate: 48_000,
    channels: 1,
    bitrate: 96,
    application: "audio"
  });

  try {
    const first = encoder.encodeIndependent([new Float32Array(9_600)]);
    const second = encoder.encodeIndependent([new Float32Array(9_600)]);
    for (const payload of [first, second]) {
      assert.equal(new TextDecoder().decode(payload.subarray(0, 4)), "OggS");
      const opusHeadOffset = payload.findIndex((value, index) =>
        index + 8 <= payload.byteLength &&
        new TextDecoder().decode(payload.subarray(index, index + 8)) === "OpusHead"
      );
      assert.ok(opusHeadOffset >= 0);
    }
  } finally {
    encoder.free();
  }
});

test("resamples both streaming and independent non-48kHz input", async () => {
  const encoder = await createOpusEncoder({
    sampleRate: 44_100,
    channels: 1,
    bitrate: 96,
    application: "audio"
  });

  try {
    const input = Float32Array.from({ length: 44_100 }, (_, index) => Math.sin(index / 19));
    const streamed = new Uint8Array([
      ...encoder.encode([input.subarray(0, 22_050)]),
      ...encoder.encode([input.subarray(22_050)]),
      ...encoder.flush()
    ]);
    const independent = encoder.encodeIndependent([input]);
    assert.equal(new TextDecoder().decode(streamed.subarray(0, 4)), "OggS");
    assert.equal(new TextDecoder().decode(independent.subarray(0, 4)), "OggS");
  } finally {
    encoder.free();
  }
});
