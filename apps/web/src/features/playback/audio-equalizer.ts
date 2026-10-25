export type EqualizerPresetId = "flat" | "bass-boost" | "vocal-boost" | "treble-boost" | "pop" | "rock";

export type EqualizerBand = {
  frequency: number;
  type: BiquadFilterType;
  gain: number;
  q?: number;
};

export const EQUALIZER_FREQUENCIES = [60, 250, 1000, 4000, 12000] as const;

export const EQUALIZER_PRESETS: Record<EqualizerPresetId, { label: string; gains: [number, number, number, number, number] }> = {
  flat: {
    label: "原声 (平直)",
    gains: [0, 0, 0, 0, 0]
  },
  "bass-boost": {
    label: "低音增强",
    gains: [6, 4, 0, 0, -1]
  },
  "vocal-boost": {
    label: "人声清晰",
    gains: [-2, 1, 4, 3, 1]
  },
  "treble-boost": {
    label: "清脆高音",
    gains: [-1, 0, 1, 4, 6]
  },
  pop: {
    label: "流行乐",
    gains: [3, 2, 0, 2, 3]
  },
  rock: {
    label: "摇滚乐",
    gains: [5, 3, -1, 3, 5]
  }
};

export class EqualizerFilterNodeChain {
  readonly filters: BiquadFilterNode[] = [];
  private currentGains: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  constructor(context: AudioContext) {
    if (typeof context.createBiquadFilter !== "function") {
      return;
    }

    const configs: Array<{ freq: number; type: BiquadFilterType; q?: number }> = [
      { freq: 60, type: "lowshelf" },
      { freq: 250, type: "peaking", q: 1 },
      { freq: 1000, type: "peaking", q: 1 },
      { freq: 4000, type: "peaking", q: 1 },
      { freq: 12000, type: "highshelf" }
    ];

    for (const conf of configs) {
      const filter = context.createBiquadFilter();
      filter.type = conf.type;
      filter.frequency.value = conf.freq;
      filter.gain.value = 0;
      if (conf.q && filter.Q) {
        filter.Q.value = conf.q;
      }
      this.filters.push(filter);
    }

    // Connect filters in series
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }
  }

  get inputNode(): BiquadFilterNode | null {
    return this.filters[0] ?? null;
  }

  get outputNode(): BiquadFilterNode | null {
    return this.filters[this.filters.length - 1] ?? null;
  }

  applyGains(gains: [number, number, number, number, number]) {
    this.currentGains = [...gains];
    for (let i = 0; i < this.filters.length && i < gains.length; i++) {
      const clampedGain = Math.max(-12, Math.min(12, gains[i]));
      try {
        this.filters[i].gain.value = clampedGain;
      } catch {
        // Safe fallback
      }
    }
  }

  applyPreset(presetId: EqualizerPresetId) {
    const preset = EQUALIZER_PRESETS[presetId] ?? EQUALIZER_PRESETS.flat;
    this.applyGains(preset.gains);
  }

  disconnect() {
    for (const filter of this.filters) {
      try {
        filter.disconnect();
      } catch {
        // Ignore disconnection errors during context reset
      }
    }
  }
}
