import { describe, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@soqaro/shared";
import {
  createRoomSnapshotResyncController,
  type RoomSnapshotResyncReason
} from "./room-snapshot-resync";

function buildSnapshot(roomId: string, joinCode = "ABC123"): RoomSnapshot {
  return {
    room: {
      id: roomId,
      hostId: "user_host",
      joinCode,
      visibility: "public",
      roomType: "interactive",
      radioAutopilot: { enabled: false },
      members: [],
      presenceRevision: 0,
      playback: {
        status: "paused",
        currentTrackId: null,
        currentQueueItemId: null,
        sourceSessionId: null,
        sourcePeerId: null,
        sourceTrackId: null,
        positionMs: 0,
        startedAt: null,
        queueVersion: 1,
        playbackRevision: 1,
        mediaEpoch: 0
      }
    },
    tracks: [],
    queue: [],
    playlists: []
  };
}

describe("room snapshot resync controller", () => {
  it("coalesces concurrent requests for the same room", async () => {
    let resolveSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;
    const loadSnapshot = vi.fn(
      () =>
        new Promise<RoomSnapshot>((resolve) => {
          resolveSnapshot = resolve;
        })
    );
    const applySnapshot = vi.fn();
    const onError = vi.fn();
    const controller = createRoomSnapshotResyncController({
      loadSnapshot,
      applySnapshot,
      onError
    });

    const firstRequest = controller.request("room_1", "socket-connect");
    const secondRequest = controller.request("room_1", "subscribe-ack");

    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    expect(resolveSnapshot).toBeTypeOf("function");
    resolveSnapshot!(buildSnapshot("room_1"));
    await Promise.all([firstRequest, secondRequest]);

    expect(applySnapshot).toHaveBeenCalledTimes(1);
    expect(applySnapshot).toHaveBeenCalledWith(
      "room_1",
      buildSnapshot("room_1"),
      "socket-connect"
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("runs one follow-up request when the same room asks to resync while a request is in flight", async () => {
    let resolveFirstSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;
    const snapshots = [buildSnapshot("room_1", "OLD111"), buildSnapshot("room_1", "NEW222")];
    const loadSnapshot = vi
      .fn<() => Promise<RoomSnapshot>>()
      .mockImplementationOnce(
        () =>
          new Promise<RoomSnapshot>((resolve) => {
            resolveFirstSnapshot = resolve;
          })
      )
      .mockResolvedValueOnce(snapshots[1]);
    const applySnapshot = vi.fn();
    const controller = createRoomSnapshotResyncController({
      loadSnapshot,
      applySnapshot,
      onError: vi.fn()
    });

    const firstRequest = controller.request("room_1", "socket-connect");
    const secondRequest = controller.request("room_1", "realtime-room-event");

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(resolveFirstSnapshot).toBeTypeOf("function");
    resolveFirstSnapshot!(snapshots[0]);
    await Promise.all([firstRequest, secondRequest]);

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(applySnapshot).toHaveBeenNthCalledWith(1, "room_1", snapshots[0], "socket-connect");
    expect(applySnapshot).toHaveBeenNthCalledWith(
      2,
      "room_1",
      snapshots[1],
      "realtime-room-event"
    );
  });

  it("ignores stale responses after reset", async () => {
    let resolveSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;
    const loadSnapshot = vi.fn(
      () =>
        new Promise<RoomSnapshot>((resolve) => {
          resolveSnapshot = resolve;
        })
    );
    const applySnapshot = vi.fn();
    const controller = createRoomSnapshotResyncController({
      loadSnapshot,
      applySnapshot,
      onError: vi.fn()
    });

    const request = controller.request("room_1", "socket-connect");
    controller.reset();
    expect(resolveSnapshot).toBeTypeOf("function");
    resolveSnapshot!(buildSnapshot("room_1"));
    await request;

    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it("surfaces only the latest request error", async () => {
    const pendingLoads = new Map<string, { reject: (error: Error) => void }>();
    const loadSnapshot = vi.fn(
      (roomId: string) =>
        new Promise<RoomSnapshot>((_resolve, reject) => {
          pendingLoads.set(roomId, { reject });
        })
    );
    const onError = vi.fn();
    const controller = createRoomSnapshotResyncController({
      loadSnapshot,
      applySnapshot: vi.fn(),
      onError
    });

    const firstRequest = controller.request("room_1", "socket-connect");
    controller.reset();
    const secondRequest = controller.request("room_2", "visibility-visible");

    pendingLoads.get("room_1")?.reject(new Error("stale"));
    pendingLoads.get("room_2")?.reject(new Error("latest"));

    await Promise.allSettled([firstRequest, secondRequest]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      "room_2",
      "visibility-visible",
      expect.objectContaining({ message: "latest" })
    );
  });

  it("allows a later request after the in-flight one finishes", async () => {
    const reasons: RoomSnapshotResyncReason[] = [];
    const snapshots = [buildSnapshot("room_1", "AAA111"), buildSnapshot("room_1", "BBB222")];
    const loadSnapshot = vi
      .fn<() => Promise<RoomSnapshot>>()
      .mockResolvedValueOnce(snapshots[0])
      .mockResolvedValueOnce(snapshots[1]);
    const applySnapshot = vi.fn(
      (_roomId: string, _snapshot: RoomSnapshot, reason: RoomSnapshotResyncReason) => {
        reasons.push(reason);
      }
    );
    const controller = createRoomSnapshotResyncController({
      loadSnapshot,
      applySnapshot,
      onError: vi.fn()
    });

    await controller.request("room_1", "socket-connect");
    await controller.request("room_1", "subscribe-ack");

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(reasons).toEqual(["socket-connect", "subscribe-ack"]);
  });

  it("accepts realtime event and watchdog resync reasons", async () => {
    const reasons: RoomSnapshotResyncReason[] = [];
    const controller = createRoomSnapshotResyncController({
      loadSnapshot: vi.fn().mockResolvedValue(buildSnapshot("room_1")),
      applySnapshot: vi.fn(
        (_roomId: string, _snapshot: RoomSnapshot, reason: RoomSnapshotResyncReason) => {
          reasons.push(reason);
        }
      ),
      onError: vi.fn()
    });

    await controller.request("room_1", "realtime-room-event");
    await controller.request("room_1", "stale-watchdog");

    expect(reasons).toEqual(["realtime-room-event", "stale-watchdog"]);
  });
});
