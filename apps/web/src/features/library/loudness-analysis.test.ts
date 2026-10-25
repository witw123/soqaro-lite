import { describe, expect, it } from "vitest";
import { analyzeAudioBuffer, LoudnessAnalyzer } from "./loudness-analysis";

describe("loudness analysis", () => {
  it("derives a stable gain from integrated loudness", () => {
    const quiet = createSine(0.25);
    const loud = createSine(0.5);
    const quietResult = analyzeAudioBuffer(toAudioBufferInput([quiet]));
    const loudResult = analyzeAudioBuffer(toAudioBufferInput([loud]));

    expect(quietResult.targetLufs).toBe(-14);
    expect(quietResult.version).toBe(1);
    expect(loudResult.integratedLufs - quietResult.integratedLufs).toBeCloseTo(6.02, 1);
    expect(loudResult.gainDb - quietResult.gainDb).toBeCloseTo(-6.02, 1);
  });

  it("keeps the streaming analyzer equivalent across PCM chunks", () => {
    const channels = [createSine(0.35)];
    const analyzer = new LoudnessAnalyzer(48_000, 1);
    analyzer.push({
      sampleRate: 48_000,
      channels: [channels[0]!.subarray(0, 20_000)]
    });
    analyzer.push({
      sampleRate: 48_000,
      channels: [channels[0]!.subarray(20_000)]
    });

    expect(analyzer.finish()).toEqual(analyzeAudioBuffer(toAudioBufferInput(channels)));
  });
});

function createSine(amplitude: number) {
  const samples = new Float32Array(48_000);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin(2 * Math.PI * 440 * index / 48_000);
  }
  return samples;
}

function toAudioBufferInput(channels: Float32Array[]) {
  return {
    sampleRate: 48_000,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel]!
  };
}
