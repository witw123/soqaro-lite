import type { RoomSnapshot } from "@soqaro/shared";

export type RoomSnapshotResyncReason =
  | "socket-connect"
  | "subscribe-ack"
  | "visibility-visible"
  | "realtime-room-event"
  | "stale-watchdog";

type RoomSnapshotResyncControllerOptions = {
  loadSnapshot: (roomId: string) => Promise<RoomSnapshot>;
  applySnapshot: (
    roomId: string,
    snapshot: RoomSnapshot,
    reason: RoomSnapshotResyncReason
  ) => void | Promise<void>;
  onError: (
    roomId: string,
    reason: RoomSnapshotResyncReason,
    error: unknown
  ) => void | Promise<void>;
};

export function createRoomSnapshotResyncController(
  options: RoomSnapshotResyncControllerOptions
) {
  let activeRequestToken = 0;
  let inFlightRoomId: string | null = null;
  let inFlightPromise: Promise<void> | null = null;
  let pendingFollowUp: { roomId: string; reason: RoomSnapshotResyncReason } | null = null;

  const shouldQueueFollowUp = (reason: RoomSnapshotResyncReason) =>
    reason === "realtime-room-event" || reason === "stale-watchdog";

  const consumePendingFollowUp = () => {
    const followUp = pendingFollowUp;
    pendingFollowUp = null;
    return followUp;
  };

  const runRequestLoop = async (
    roomId: string,
    initialReason: RoomSnapshotResyncReason,
    requestToken: number
  ) => {
    let reason = initialReason;

    try {
      while (true) {
        consumePendingFollowUp();
        const snapshot = await options.loadSnapshot(roomId);
        if (requestToken !== activeRequestToken) {
          return;
        }

        await options.applySnapshot(roomId, snapshot, reason);
        if (requestToken !== activeRequestToken) {
          return;
        }

        const followUp = consumePendingFollowUp();
        if (!followUp || followUp.roomId !== roomId) {
          return;
        }

        reason = followUp.reason;
      }
    } catch (error) {
      if (requestToken !== activeRequestToken) {
        return;
      }

      await options.onError(roomId, reason, error);
    } finally {
      if (requestToken === activeRequestToken) {
        inFlightRoomId = null;
        inFlightPromise = null;
        pendingFollowUp = null;
      }
    }
  };

  return {
    async request(roomId: string, reason: RoomSnapshotResyncReason) {
      if (!roomId) {
        return;
      }

      if (inFlightPromise && inFlightRoomId === roomId) {
        if (shouldQueueFollowUp(reason)) {
          pendingFollowUp = { roomId, reason };
        }
        return inFlightPromise;
      }

      const requestToken = ++activeRequestToken;
      inFlightRoomId = roomId;
      inFlightPromise = runRequestLoop(roomId, reason, requestToken);

      return inFlightPromise;
    },

    reset() {
      activeRequestToken += 1;
      inFlightRoomId = null;
      inFlightPromise = null;
      pendingFollowUp = null;
    }
  };
}
