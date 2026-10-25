import { describe, expect, it } from "vitest";
import { resolveProviderTrackSource } from "./provider-track-identity";

describe("provider track identity", () => {
  it("keeps provider identity when a legacy room record says local_upload", () => {
    expect(resolveProviderTrackSource({
      sourceType: "local_upload",
      sourceRef: { provider: "netease", trackId: "123" }
    })).toEqual({ provider: "netease", trackId: "123" });
  });

  it("requires the source type and provider reference to agree for current records", () => {
    expect(resolveProviderTrackSource({
      sourceType: "qqmusic",
      sourceRef: { provider: "netease", trackId: "123" }
    })).toBeNull();
  });
});

