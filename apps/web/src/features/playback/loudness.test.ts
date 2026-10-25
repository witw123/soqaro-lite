import { describe, expect, it } from "vitest";
import { resolveLoudnessGainDb } from "./loudness";

describe("resolveLoudnessGainDb", () => {
  it("uses the track gain only when normalization is enabled", () => {
    const track = { loudness: { gainDb: -8 } };

    expect(resolveLoudnessGainDb(track, true)).toBe(-8);
    expect(resolveLoudnessGainDb(track, false)).toBe(0);
  });

  it("clamps invalid or extreme track gains", () => {
    expect(resolveLoudnessGainDb({ loudness: { gainDb: 30 } }, true)).toBe(12);
    expect(resolveLoudnessGainDb({ loudness: { gainDb: -30 } }, true)).toBe(-24);
    expect(resolveLoudnessGainDb({ loudness: undefined }, true)).toBe(0);
  });
});
