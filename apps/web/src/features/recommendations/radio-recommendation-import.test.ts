import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@soqaro/shared";
import { importRadioRecommendationCandidates } from "./radio-recommendation-import";
import type { RadioRecommendationCandidate } from "./radio-recommendations";

const api = vi.hoisted(() => ({
  getRoom: vi.fn(),
  insertRadioAutopilotNextTrack: vi.fn()
}));

vi.mock("@/lib/network/soqaro-api", () => ({
  soqaroApi: api
}));

describe("radio recommendation import", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("continues with the next recommendation after an import failure", async () => {
    const first = recommendation("netease", "n1", "First");
    const second = recommendation("qqmusic", "q2", "Second");
    const refreshed = roomWithTrack("track_q2", "qqmusic", "q2");
    const seen: string[] = [];
    const failed = vi.fn();
    api.getRoom.mockResolvedValue(refreshed);
    api.insertRadioAutopilotNextTrack.mockResolvedValue({});

    await expect(importRadioRecommendationCandidates({
      roomId: "room_1",
      candidates: [first, second],
      isCurrent: () => true,
      isSeedCurrent: () => true,
      onCandidate: (candidate) => seen.push(candidate.candidate.providerTrackId),
      onCandidateFailed: failed,
      onImportNeteaseTrack: vi.fn().mockRejectedValue(new Error("first unavailable")),
      onImportQqMusicTrack: vi.fn().mockResolvedValue(undefined),
      onRefreshRoom: vi.fn().mockResolvedValue(refreshed)
    })).resolves.toEqual({
      kind: "inserted",
      candidate: second,
      refreshedSnapshot: refreshed
    });

    expect(seen).toEqual(["n1", "q2"]);
    expect(failed).toHaveBeenCalledWith(first, expect.any(Error));
    expect(api.insertRadioAutopilotNextTrack).toHaveBeenCalledWith("room_1", {
      trackId: "track_q2"
    });
  });

  it("does not insert a candidate after the room seed becomes stale", async () => {
    let current = true;
    const candidate = recommendation("netease", "n1", "First");
    const importTrack = vi.fn(async () => {
      current = false;
    });

    await expect(importRadioRecommendationCandidates({
      roomId: "room_1",
      candidates: [candidate],
      isCurrent: () => current,
      isSeedCurrent: () => true,
      onCandidate: vi.fn(),
      onImportNeteaseTrack: importTrack,
      onImportQqMusicTrack: vi.fn(),
      onRefreshRoom: vi.fn()
    })).resolves.toEqual({ kind: "cancelled" });

    expect(api.getRoom).not.toHaveBeenCalled();
    expect(api.insertRadioAutopilotNextTrack).not.toHaveBeenCalled();
  });

  it("uses a track already in the room without importing it again", async () => {
    const candidate = recommendation("netease", "n1", "Existing");
    candidate.existingRoomTrackId = "track_existing";
    const refreshed = roomWithTrack("track_existing", "netease", "n1");
    api.getRoom.mockResolvedValue(refreshed);
    api.insertRadioAutopilotNextTrack.mockResolvedValue({});
    const importTrack = vi.fn();

    await expect(importRadioRecommendationCandidates({
      roomId: "room_1",
      candidates: [candidate],
      isCurrent: () => true,
      isSeedCurrent: () => true,
      onCandidate: vi.fn(),
      onImportNeteaseTrack: importTrack,
      onImportQqMusicTrack: vi.fn(),
      onRefreshRoom: vi.fn().mockResolvedValue(refreshed)
    })).resolves.toMatchObject({ kind: "inserted", candidate });

    expect(importTrack).not.toHaveBeenCalled();
    expect(api.insertRadioAutopilotNextTrack).toHaveBeenCalledWith("room_1", {
      trackId: "track_existing"
    });
  });
});

function recommendation(
  provider: "netease" | "qqmusic",
  providerTrackId: string,
  title: string
): RadioRecommendationCandidate {
  return {
    candidate: {
      provider,
      providerTrackId,
      access: "free",
      quality: "exhigh",
      title,
      artist: "Artist",
      album: "Album",
      durationMs: 180_000,
      artworkUrl: null
    } as RadioRecommendationCandidate["candidate"],
    lastFmMatch: 0.9,
    providerMatchScore: 1,
    recommendationScore: 0.9,
    recommendationReasons: ["base"]
  };
}

function roomWithTrack(
  id: string,
  provider: "netease" | "qqmusic",
  providerTrackId: string
) {
  return {
    tracks: [{ id, sourceRef: { provider, trackId: providerTrackId } }]
  } as unknown as RoomSnapshot;
}
