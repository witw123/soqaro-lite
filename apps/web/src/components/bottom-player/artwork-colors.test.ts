import { describe, expect, it } from "vitest";
import { getArtworkSourceUrl } from "./artwork-colors";

describe("getArtworkSourceUrl", () => {
  it("loads NetEase artwork directly after normalizing its protocol", () => {
    expect(getArtworkSourceUrl("http://p1.music.126.net/cover.jpg"))
      .toBe("https://p1.music.126.net/cover.jpg");
  });

  it("loads QQ Music artwork directly after normalizing its protocol", () => {
    expect(getArtworkSourceUrl("http://y.gtimg.cn/music/photo_new/cover.jpg"))
      .toBe("https://y.gtimg.cn/music/photo_new/cover.jpg");
  });

  it("keeps browser-local artwork unchanged", () => {
    expect(getArtworkSourceUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(getArtworkSourceUrl("blob:http://localhost:3000/local-cover")).toBe("blob:http://localhost:3000/local-cover");
  });
});
