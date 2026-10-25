import type { TrackLoudness } from "@soqaro/shared";

export const loudnessTargetLufs = -14 as const;
export const loudnessVersion = 1 as const;

type PcmInput = {
  sampleRate: number;
  channels: ReadonlyArray<Float32Array>;
};

type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

type BiquadState = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

const loudnessBlockMs = 400;
const loudnessStepMs = 100;
const absoluteGateLufs = -70;
const relativeGateOffsetLufs = -10;
const truePeakFloorDbtp = -120;
const maxBoostDb = 12;
const maxCutDb = -24;
const truePeakCeilingDbtp = -1;

export function analyzeAudioBuffer(input: {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData: (channel: number) => Float32Array;
}): TrackLoudness {
  const analyzer = new LoudnessAnalyzer(input.sampleRate, input.numberOfChannels);
  const channels = Array.from(
    { length: input.numberOfChannels },
    (_, channelIndex) => input.getChannelData(channelIndex)
  );
  analyzer.push({ sampleRate: input.sampleRate, channels });
  return analyzer.finish();
}

export class LoudnessAnalyzer {
  private readonly blockSamples: number;
  private readonly stepSamples: number;
  private readonly ring: Float64Array;
  private readonly shelfStates: BiquadState[];
  private readonly highPassStates: BiquadState[];
  private readonly shelf: BiquadCoefficients;
  private readonly highPass: BiquadCoefficients;
  private readonly blockEnergies: number[] = [];
  private ringOffset = 0;
  private ringCount = 0;
  private ringEnergy = 0;
  private sampleCount = 0;
  private lastBlockEnd = 0;
  private peak = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly channelCount: number
  ) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("响度分析采样率无效。");
    }
    if (channelCount < 1 || channelCount > 2) {
      throw new Error("响度分析仅支持单声道或双声道。");
    }
    this.blockSamples = Math.max(1, Math.round(sampleRate * loudnessBlockMs / 1000));
    this.stepSamples = Math.max(1, Math.round(sampleRate * loudnessStepMs / 1000));
    this.ring = new Float64Array(this.blockSamples);
    this.shelf = designHighShelf(sampleRate);
    this.highPass = designHighPass(sampleRate);
    this.shelfStates = Array.from({ length: channelCount }, () => createBiquadState());
    this.highPassStates = Array.from({ length: channelCount }, () => createBiquadState());
  }

  push(input: PcmInput) {
    if (input.sampleRate !== this.sampleRate) {
      throw new Error("响度分析输入采样率发生变化。");
    }
    if (input.channels.length !== this.channelCount) {
      throw new Error("响度分析输入声道数发生变化。");
    }
    const frameCount = input.channels[0]?.length ?? 0;
    if (input.channels.some((channel) => channel.length !== frameCount)) {
      throw new Error("响度分析输入声道长度不一致。");
    }

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      let energy = 0;
      for (let channelIndex = 0; channelIndex < this.channelCount; channelIndex += 1) {
        const sample = input.channels[channelIndex]![frameIndex] ?? 0;
        this.peak = Math.max(this.peak, Math.abs(sample));
        const shelfSample = processBiquad(
          sample,
          this.shelf,
          this.shelfStates[channelIndex]!
        );
        const weightedSample = processBiquad(
          shelfSample,
          this.highPass,
          this.highPassStates[channelIndex]!
        );
        energy += weightedSample * weightedSample;
      }

      this.appendEnergy(energy);
    }
  }

  finish(): TrackLoudness {
    if (this.ringCount > 0 && this.lastBlockEnd !== this.sampleCount) {
      this.blockEnergies.push(this.ringEnergy / this.ringCount);
      this.lastBlockEnd = this.sampleCount;
    }

    const absoluteBlocks = this.blockEnergies.filter((energy) =>
      toLufs(energy) >= absoluteGateLufs
    );
    const ungatedEnergy = average(absoluteBlocks);
    const ungatedLufs = toLufs(ungatedEnergy);
    const relativeGate = ungatedLufs + relativeGateOffsetLufs;
    const gatedBlocks = absoluteBlocks.filter((energy) => toLufs(energy) >= relativeGate);
    const integratedLufs = toLufs(average(gatedBlocks.length > 0 ? gatedBlocks : absoluteBlocks));
    const truePeakDbtp = this.peak > 0
      ? 20 * Math.log10(this.peak)
      : truePeakFloorDbtp;
    const requestedGainDb = loudnessTargetLufs - integratedLufs;
    const peakLimitedGainDb = truePeakCeilingDbtp - truePeakDbtp;
    const gainDb = clamp(
      Math.min(requestedGainDb, peakLimitedGainDb),
      maxCutDb,
      maxBoostDb
    );

    return {
      integratedLufs: roundMetric(integratedLufs),
      truePeakDbtp: roundMetric(truePeakDbtp),
      gainDb: roundMetric(gainDb),
      targetLufs: loudnessTargetLufs,
      version: loudnessVersion
    };
  }

  private appendEnergy(energy: number) {
    if (this.ringCount < this.blockSamples) {
      const index = (this.ringOffset + this.ringCount) % this.blockSamples;
      this.ring[index] = energy;
      this.ringCount += 1;
      this.ringEnergy += energy;
    } else {
      const removed = this.ring[this.ringOffset] ?? 0;
      this.ring[this.ringOffset] = energy;
      this.ringOffset = (this.ringOffset + 1) % this.blockSamples;
      this.ringEnergy += energy - removed;
    }

    this.sampleCount += 1;
    if (
      this.ringCount === this.blockSamples &&
      this.sampleCount - this.lastBlockEnd >= this.stepSamples
    ) {
      this.blockEnergies.push(this.ringEnergy / this.blockSamples);
      this.lastBlockEnd = this.sampleCount;
    }
  }
}

function designHighShelf(sampleRate: number): BiquadCoefficients {
  const f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  const q = 0.7071752369554196;
  const k = Math.tan(Math.PI * f0 / sampleRate);
  const v = 10 ** (gain / 20);
  const rootV = v ** 0.499666774455;
  const a0 = 1 + k / q + k * k;
  return {
    b0: (v + rootV * k / q + k * k) / a0,
    b1: 2 * (k * k - v) / a0,
    b2: (v - rootV * k / q + k * k) / a0,
    a1: 2 * (k * k - 1) / a0,
    a2: (1 - k / q + k * k) / a0
  };
}

function designHighPass(sampleRate: number): BiquadCoefficients {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan(Math.PI * f0 / sampleRate);
  const a0 = 1 + k / q + k * k;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: 2 * (k * k - 1) / a0,
    a2: (1 - k / q + k * k) / a0
  };
}

function createBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

function processBiquad(
  input: number,
  coefficients: BiquadCoefficients,
  state: BiquadState
) {
  const output = coefficients.b0 * input +
    coefficients.b1 * state.x1 +
    coefficients.b2 * state.x2 -
    coefficients.a1 * state.y1 -
    coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
}

function toLufs(energy: number) {
  return energy > 0 ? -0.691 + 10 * Math.log10(energy) : absoluteGateLufs;
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}
