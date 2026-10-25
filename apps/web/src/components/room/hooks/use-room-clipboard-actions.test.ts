import { describe, expect, it } from "vitest";
import { buildRoomShareUrl } from "./use-room-clipboard-actions";

describe("room sharing", () => {
  it("builds an absolute room URL from the current website origin", () => {
    expect(buildRoomShareUrl("https://music.example.com", "room/42")).toBe(
      "https://music.example.com/room/room%2F42"
    );
  });
});
