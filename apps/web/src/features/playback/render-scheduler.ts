export function resolveCanvasFrameDelayMs(input: {
  isPageVisible: boolean;
  isPlaying: boolean;
  reducedMotion: boolean;
}) {
  if (!input.isPageVisible) {
    return null;
  }

  if (input.reducedMotion) {
    return 100;
  }

  return input.isPlaying ? 33 : 250;
}

export function resolveProgressRenderIntervalMs(input: { isPageVisible: boolean }) {
  return input.isPageVisible ? 250 : 1000;
}

export function resolveAnchoredProgressMs(input: {
  progressMs: number;
  receivedAtMs: number;
  durationMs: number;
  nowMs: number;
}) {
  const elapsedMs = Math.max(0, input.nowMs - input.receivedAtMs);
  const nextProgressMs = input.progressMs + elapsedMs;

  if (input.durationMs > 0) {
    return Math.min(Math.max(0, nextProgressMs), input.durationMs);
  }

  return Math.max(0, nextProgressMs);
}
