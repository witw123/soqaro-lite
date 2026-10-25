import { describe, expect, it } from "vitest";
import { resolvePreferredArtworkUrl } from "./preferred-artwork";

describe("resolvePreferredArtworkUrl", () => {
  it("prefers a browser-local cover over the provider URL", () => {
    expect(resolvePreferredArtworkUrl(
      "data:image/jpeg;base64,LOCAL",
      "https://y.gtimg.cn/music/photo_new/cover.jpg"
    )).toBe("data:image/jpeg;base64,LOCAL");
  });

  it("accepts a local blob URL before falling back to a remote cover", () => {
    expect(resolvePreferredArtworkUrl(
      "blob:http://localhost/local-cover",
      "https://p1.music.126.net/cover.jpg"
    )).toBe("blob:http://localhost/local-cover");
    expect(resolvePreferredArtworkUrl(null, "https://p1.music.126.net/cover.jpg"))
      .toBe("https://p1.music.126.net/cover.jpg");
  });
});
