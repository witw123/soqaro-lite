import { describe, expect, it, vi } from "vitest";
import {
  EQUALIZER_FREQUENCIES,
  EQUALIZER_PRESETS,
  EqualizerFilterNodeChain,
  type EqualizerPresetId
} from "./audio-equalizer";

function createMockAudioContext() {
  const filters: Array<{
    type: string;
    frequency: { value: number };
    gain: { value: number };
    Q: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  const context = {
    createBiquadFilter: vi.fn(() => {
      const filter = {
        type: "peaking",
        frequency: { value: 1000 },
        gain: { value: 0 },
        Q: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn()
      };
      filters.push(filter);
      return filter;
    })
  };

  return { context, filters };
}

describe("audio-equalizer", () => {
  it("defines 5 fixed frequency bands", () => {
    expect(EQUALIZER_FREQUENCIES).toEqual([60, 250, 1000, 4000, 12000]);
  });

  it("provides standard tuned presets", () => {
    const presets: EqualizerPresetId[] = ["flat", "bass-boost", "vocal-boost", "treble-boost", "pop", "rock"];
    for (const id of presets) {
      expect(EQUALIZER_PRESETS[id]).toBeDefined();
      expect(EQUALIZER_PRESETS[id].gains.length).toBe(5);
    }
  });

  it("constructs a 5-filter chain connected in series", () => {
    const { context, filters } = createMockAudioContext();
    const chain = new EqualizerFilterNodeChain(context as unknown as AudioContext);

    expect(filters.length).toBe(5);
    expect(chain.filters.length).toBe(5);
    expect(chain.inputNode).toBe(filters[0]);
    expect(chain.outputNode).toBe(filters[4]);

    // Check filter connections: 0->1, 1->2, 2->3, 3->4
    expect(filters[0].connect).toHaveBeenCalledWith(filters[1]);
    expect(filters[1].connect).toHaveBeenCalledWith(filters[2]);
    expect(filters[2].connect).toHaveBeenCalledWith(filters[3]);
    expect(filters[3].connect).toHaveBeenCalledWith(filters[4]);

    // Types and frequencies
    expect(filters[0].type).toBe("lowshelf");
    expect(filters[0].frequency.value).toBe(60);
    expect(filters[4].type).toBe("highshelf");
    expect(filters[4].frequency.value).toBe(12000);
  });

  it("applies gains clamped between -12dB and +12dB", () => {
    const { context, filters } = createMockAudioContext();
    const chain = new EqualizerFilterNodeChain(context as unknown as AudioContext);

    chain.applyGains([20, -15, 3, 0, -2]);

    expect(filters[0].gain.value).toBe(12);
    expect(filters[1].gain.value).toBe(-12);
    expect(filters[2].gain.value).toBe(3);
    expect(filters[3].gain.value).toBe(0);
    expect(filters[4].gain.value).toBe(-2);
  });

  it("applies presets correctly", () => {
    const { context, filters } = createMockAudioContext();
    const chain = new EqualizerFilterNodeChain(context as unknown as AudioContext);

    chain.applyPreset("bass-boost");
    expect(filters[0].gain.value).toBe(6);
    expect(filters[1].gain.value).toBe(4);
    expect(filters[4].gain.value).toBe(-1);
  });

  it("disconnects all filters on cleanup", () => {
    const { context, filters } = createMockAudioContext();
    const chain = new EqualizerFilterNodeChain(context as unknown as AudioContext);

    chain.disconnect();
    for (const filter of filters) {
      expect(filter.disconnect).toHaveBeenCalled();
    }
  });
});
