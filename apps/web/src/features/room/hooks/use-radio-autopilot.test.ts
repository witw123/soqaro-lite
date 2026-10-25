import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@soqaro/shared";
import { isRadioPlaybackAtQueueEnd } from "./use-radio-autopilot";

function buildSnapshot(
  status: "playing" | "paused",
  currentQueueItemId: string | null,
  queueItemIds: string[]
) {
  return {
    room: {
      playback: {
        status,
        currentQueueItemId
      }
    },
    queue: queueItemIds.map((id) => ({ id }))
  } as RoomSnapshot;
}

describe("radio autopilot queue trigger", () => {
  it("triggers only while the last queue item is playing", () => {
    expect(isRadioPlaybackAtQueueEnd(buildSnapshot("playing", "queue_2", ["queue_1", "queue_2"]))).toBe(true);
    expect(isRadioPlaybackAtQueueEnd(buildSnapshot("playing", "queue_1", ["queue_1", "queue_2"]))).toBe(false);
    expect(isRadioPlaybackAtQueueEnd(buildSnapshot("paused", "queue_2", ["queue_1", "queue_2"]))).toBe(false);
    expect(isRadioPlaybackAtQueueEnd(buildSnapshot("playing", null, ["queue_1"]))).toBe(false);
  });
});
