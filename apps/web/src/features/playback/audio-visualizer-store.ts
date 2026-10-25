export const audioVisualizerStore = {
  samples: [] as number[],
  averageEnergy: 0,
  peakEnergy: 0,
  sourceKind: "none" as "none" | "local-stream" | "local-element",
  graphKey: null as string | null,
  hasLiveGraph: false,
  lastError: null as string | null,
};
