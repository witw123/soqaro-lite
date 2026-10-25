import { describe, expect, it } from "vitest";
import { resolveLocalArtworkUrl } from "./audio-metadata";

describe("resolveLocalArtworkUrl", () => {
  it("turns a downloaded artwork blob into a browser-local data URL", async () => {
    const result = await resolveLocalArtworkUrl(
      new Blob(["not an audio file"], { type: "audio/mpeg" }),
      "https://y.gtimg.cn/music/photo_new/cover.jpg",
      new Blob(["cover"], { type: "image/jpeg" })
    );

    expect(result).toBe("data:image/jpeg;base64,Y292ZXI=");
  });

  it("keeps an already-local artwork URL without parsing the audio", async () => {
    const localUrl = "data:image/png;base64,AAAA";
    await expect(resolveLocalArtworkUrl(new Blob(["audio"]), localUrl)).resolves.toBe(localUrl);
  });
});
