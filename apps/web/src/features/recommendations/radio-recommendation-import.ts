import type {
  NeteaseTrackCandidate,
  QqMusicTrackCandidate,
  RoomSnapshot
} from "@soqaro/shared";
import { soqaroApi } from "@/lib/network/soqaro-api";
import type { RadioRecommendationCandidate } from "./radio-recommendations";

export type RadioRecommendationImportResult =
  | {
    kind: "inserted";
    candidate: RadioRecommendationCandidate;
    refreshedSnapshot: RoomSnapshot | null;
  }
  | { kind: "cancelled" }
  | { kind: "failed"; error: unknown };

export async function importRadioRecommendationCandidates(input: {
  roomId: string;
  candidates: RadioRecommendationCandidate[];
  isCurrent: () => boolean;
  isSeedCurrent: (snapshot: RoomSnapshot) => boolean;
  onCandidate: (candidate: RadioRecommendationCandidate) => void;
  onCandidateFailed?: (candidate: RadioRecommendationCandidate, error: unknown) => void;
  onImportNeteaseTrack: (track: NeteaseTrackCandidate) => Promise<void>;
  onImportQqMusicTrack: (track: QqMusicTrackCandidate) => Promise<void>;
  onRefreshRoom: () => Promise<RoomSnapshot | null>;
}): Promise<RadioRecommendationImportResult> {
  let lastError: unknown = null;
  for (const candidate of input.candidates) {
    if (!input.isCurrent()) return { kind: "cancelled" };
    input.onCandidate(candidate);
    try {
      if (!candidate.existingRoomTrackId) {
        if (candidate.candidate.provider === "netease") {
          await input.onImportNeteaseTrack(candidate.candidate);
        } else if (candidate.candidate.provider === "qqmusic") {
          await input.onImportQqMusicTrack(candidate.candidate);
        }
      }
      if (!input.isCurrent()) return { kind: "cancelled" };

      const freshSnapshot = await soqaroApi.getRoom(input.roomId);
      if (!input.isCurrent() || !input.isSeedCurrent(freshSnapshot)) {
        return { kind: "cancelled" };
      }
      const imported = freshSnapshot.tracks.find(
        (track) =>
          track.id === candidate.existingRoomTrackId ||
          (track.sourceRef?.provider === candidate.candidate.provider &&
            track.sourceRef.trackId === candidate.candidate.providerTrackId)
      );
      if (!imported) {
        throw new Error(`《${candidate.candidate.title}》导入后未同步到曲库。`);
      }

      await soqaroApi.insertRadioAutopilotNextTrack(input.roomId, {
        trackId: imported.id
      });
      if (!input.isCurrent()) return { kind: "cancelled" };

      return {
        kind: "inserted",
        candidate,
        refreshedSnapshot: await input.onRefreshRoom()
      };
    } catch (error) {
      if (!input.isCurrent()) return { kind: "cancelled" };
      input.onCandidateFailed?.(candidate, error);
      lastError = error;
    }
  }
  return {
    kind: "failed",
    error: lastError ?? new Error("候选歌曲都无法导入。")
  };
}
