import { describe, expect, it } from "vitest";
import {
  extractApiErrorMessage,
  resolveDownloadedAudioMimeType
} from "./soqaro-api";

describe("soqaro-api helpers", () => {
  it("extracts a string message from a json error payload", () => {
    expect(
      extractApiErrorMessage('{"statusCode":500,"message":"Internal server error"}')
    ).toBe("Internal server error");
  });

  it("extracts an array message from a json error payload", () => {
    expect(
      extractApiErrorMessage(
        '{"statusCode":400,"message":["title should not be empty","trackIds must be an array"]}'
      )
    ).toBe("title should not be empty, trackIds must be an array");
  });

  it("falls back to plain text for non-json payloads", () => {
    expect(extractApiErrorMessage("Playback state version conflict.")).toBe(
      "Playback state version conflict."
    );
  });

  it("detects QQ/NetEase audio from the payload instead of trusting a generic MIME", async () => {
    await expect(
      resolveDownloadedAudioMimeType(
        new Blob([Uint8Array.of(0x66, 0x4c, 0x61, 0x43, 0x00)], {
          type: "application/octet-stream"
        }),
        "application/octet-stream"
      )
    ).resolves.toBe("audio/flac");

    await expect(
      resolveDownloadedAudioMimeType(
        new Blob([Uint8Array.of(0x49, 0x44, 0x33, 0x04, 0x00)], {
          type: "audio/mpeg"
        }),
        "audio/mpeg"
      )
    ).resolves.toBe("audio/mpeg");
  });

  it("rejects empty and HTML provider responses", async () => {
    await expect(resolveDownloadedAudioMimeType(new Blob(), "audio/mpeg")).rejects.toThrow(
      "音频为空"
    );
    await expect(
      resolveDownloadedAudioMimeType(new Blob(["<html>error</html>"], { type: "text/html" }), "text/html")
    ).rejects.toThrow("错误信息");
  });
});
