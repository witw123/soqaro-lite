import type { PlaybackMode } from "@soqaro/shared";
import type { LocalPlaylistTrackRecord } from "@/features/library/indexeddb";
import {
  hasForegroundPlaybackPreparation,
  prepareTrackForImmediatePlayback,
  subscribeForegroundPlaybackPreparation
} from "./provider-playback-preparation";

export function canPrepareProviderTrack(track: LocalPlaylistTrackRecord) {
  return Boolean(track.providerTrackId) &&
    (track.provider === "netease" || track.provider === "qqmusic" || track.provider === "bilibili");
}

export function getQueuePreloadWindow(
  tracks: readonly LocalPlaylistTrackRecord[],
  currentId: string | null,
  mode: PlaybackMode,
  nextId: string | null,
  shuffleBag: readonly string[]
) {
  if (!currentId) return [];
  const currentIndex = tracks.findIndex((track) => track.id === currentId);
  const ordered = mode === "shuffle"
    ? shuffleBag.map((id) => tracks.find((track) => track.id === id))
        .filter((track): track is LocalPlaylistTrackRecord => Boolean(track))
    : mode === "single"
      ? []
      : [...tracks.slice(currentIndex + 1), ...tracks.slice(0, currentIndex)];
  const next = tracks.find((track) => track.id === nextId);
  return [...(next ? [next] : []), ...ordered]
    .filter((track, index, list) =>
      track.id !== currentId && list.findIndex((item) => item.id === track.id) === index
    )
    .slice(0, 2);
}

/** Owns only the next two queue entries, independent of which page is visible. */
export class QueuePreloader {
  private tracks: readonly LocalPlaylistTrackRecord[] = [];
  private jobs = new Map<string, { controller: AbortController; settled: boolean }>();
  private unsubscribe: () => void;

  constructor(private onPrepared: (record: LocalPlaylistTrackRecord) => void) {
    this.unsubscribe = subscribeForegroundPlaybackPreparation(() => this.reconcile());
  }

  update(tracks: readonly LocalPlaylistTrackRecord[]) {
    this.tracks = tracks;
    this.reconcile();
  }

  dispose() {
    this.unsubscribe();
    this.tracks = [];
    this.reconcile();
  }

  private reconcile() {
    const paused = hasForegroundPlaybackPreparation();
    const wanted = new Set(this.tracks.map((track) => track.id));
    for (const [id, job] of this.jobs) {
      if (!wanted.has(id) || (paused && !job.settled)) {
        job.controller.abort();
        this.jobs.delete(id);
      }
    }
    if (paused) return;
    for (const track of this.tracks) {
      if (!canPrepareProviderTrack(track) || this.jobs.has(track.id)) continue;
      const job = { controller: new AbortController(), settled: false };
      this.jobs.set(track.id, job);
      void prepareTrackForImmediatePlayback(track, {
        signal: job.controller.signal,
        background: true
      }).then(({ record }) => {
        if (job.controller.signal.aborted) return;
        job.settled = true;
        this.onPrepared(record);
      }).catch(() => {
        // Retry on demand when this entry is played, not on every render.
        job.settled = true;
      });
    }
  }
}
