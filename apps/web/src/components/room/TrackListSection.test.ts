import { describe, expect, it } from "vitest";
import { canDeleteLibraryTrack, filterLibraryTracks } from "./TrackListSection";
import { reorderWithPosition } from "@/components/bottom-player/PlayerQueueDrawer";

describe("TrackListSection helpers", () => {
  it("allows only the original uploader to delete a library track", () => {
    const track = {
      ownerSessionId: "owner_1"
    };

    expect(
      canDeleteLibraryTrack({
        track,
        activeSessionUserId: "host_1",
      })
    ).toBe(false);
    expect(
      canDeleteLibraryTrack({
        track,
        activeSessionUserId: "owner_1",
      })
    ).toBe(true);
    expect(
      canDeleteLibraryTrack({
        track,
        activeSessionUserId: "member_2",
      })
    ).toBe(false);
    expect(
      canDeleteLibraryTrack({
        track,
        activeSessionUserId: "owner_1",
        hasLibraryPermission: false
      })
    ).toBe(false);
  });

  it("filters tracks by the active uploader", () => {
    const tracks = [
      { id: "track_1", ownerSessionId: "owner_1" },
      { id: "track_2", ownerSessionId: "member_2" },
      { id: "track_3", ownerSessionId: "owner_1" }
    ];

    expect(filterLibraryTracks(tracks, "owner_1", "all").map((track) => track.id)).toEqual([
      "track_1",
      "track_2",
      "track_3"
    ]);
    expect(filterLibraryTracks(tracks, "owner_1", "mine").map((track) => track.id)).toEqual([
      "track_1",
      "track_3"
    ]);
    expect(filterLibraryTracks(tracks, "owner_1", "others").map((track) => track.id)).toEqual([
      "track_2"
    ]);
  });
});

describe("reorderWithPosition", () => {
  const items = [
    { id: "A" },
    { id: "B" },
    { id: "C" },
    { id: "D" },
    { id: "E" }
  ];

  it("can drag down and insert before or after target", () => {
    // Drag A before D -> [B, C, A, D, E]
    const beforeD = reorderWithPosition(items, "A", "D", "before", (x) => x.id);
    expect(beforeD.map((x) => x.id)).toEqual(["B", "C", "A", "D", "E"]);

    // Drag A after D -> [B, C, D, A, E]
    const afterD = reorderWithPosition(items, "A", "D", "after", (x) => x.id);
    expect(afterD.map((x) => x.id)).toEqual(["B", "C", "D", "A", "E"]);
  });

  it("can drag up and insert before or after target", () => {
    // Drag E before B -> [A, E, B, C, D]
    const beforeB = reorderWithPosition(items, "E", "B", "before", (x) => x.id);
    expect(beforeB.map((x) => x.id)).toEqual(["A", "E", "B", "C", "D"]);

    // Drag E after B -> [A, B, E, C, D]
    const afterB = reorderWithPosition(items, "E", "B", "after", (x) => x.id);
    expect(afterB.map((x) => x.id)).toEqual(["A", "B", "E", "C", "D"]);
  });

  it("can move an item to the very top (before first item)", () => {
    const toTop = reorderWithPosition(items, "D", "A", "before", (x) => x.id);
    expect(toTop.map((x) => x.id)).toEqual(["D", "A", "B", "C", "E"]);
  });

  it("can move an item to the very bottom (after last item)", () => {
    const toBottom = reorderWithPosition(items, "B", "E", "after", (x) => x.id);
    expect(toBottom.map((x) => x.id)).toEqual(["A", "C", "D", "E", "B"]);
  });

  it("handles dropping on itself as no-op", () => {
    const same = reorderWithPosition(items, "C", "C", "before", (x) => x.id);
    expect(same.map((x) => x.id)).toEqual(["A", "B", "C", "D", "E"]);
  });
});
