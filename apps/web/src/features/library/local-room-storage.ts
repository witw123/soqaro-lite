"use client";

import type { RoomSnapshot } from "@soqaro/shared";
import { getLocalAudioDirectory } from "@/features/library/indexeddb";
import { LocalRepository } from "./local-repository";
import { enqueueLocalRepositoryWrite } from "./local-repository-queue";

export async function persistRoomSnapshotToLocalRepository(snapshot: RoomSnapshot) {
  return enqueueLocalRepositoryWrite(async () => {
    const directory = await getLocalAudioDirectory();
    if (!directory) return false;

    const repository = await LocalRepository.open(directory.handle, { recover: false });
    await repository.writeRoomSnapshot(snapshot);
    return true;
  });
}

export async function deleteRoomSnapshotFromLocalRepository(roomId: string) {
  return enqueueLocalRepositoryWrite(async () => {
    const directory = await getLocalAudioDirectory();
    if (!directory) return false;

    const repository = await LocalRepository.open(directory.handle, { recover: false });
    await repository.removeRoomTrackReferences(roomId);
    await repository.deleteRoom(roomId);
    return true;
  });
}
