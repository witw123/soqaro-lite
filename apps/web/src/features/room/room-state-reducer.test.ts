import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot, RoomSnapshot } from "@soqaro/shared";
import {
  initialRoomStateStore,
  roomStateReducer,
  type RoomStateStore
} from "./room-state-reducer";

function createPlaybackSnapshot(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return {
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
    mediaEpoch: 1,
    ...overrides
  };
}

function createRoomSnapshot(
  overrides: {
    room?: Partial<RoomSnapshot["room"]>;
    tracks?: RoomSnapshot["tracks"];
    queue?: RoomSnapshot["queue"];
    playlists?: RoomSnapshot["playlists"];
  } = {}
): RoomSnapshot {
  const { room: roomOverrides, tracks, queue, playlists } = overrides;
  const playback = createPlaybackSnapshot(roomOverrides?.playback);

  return {
    room: {
      id: "room_1",
      hostId: "host",
      joinCode: "ABC123",
      visibility: "public",
      roomType: roomOverrides?.roomType ?? "interactive",
      members: [
        {
          id: "host",
          nickname: "Host",
          role: "host",
          joinedAt: "2026-04-04T00:00:00.000Z",
          peerId: "peer-host",
          presenceState: "online"
        },
        {
          id: "member",
          nickname: "Member",
          role: "member",
          joinedAt: "2026-04-04T00:01:00.000Z",
          peerId: null,
          presenceState: "offline"
        }
      ],
      presenceRevision: 1,
      roomRevision: 1,
      playback,
      ...roomOverrides,
      radioAutopilot: roomOverrides?.radioAutopilot ?? {
        enabled: false
      }
    },
    tracks: tracks ?? [
      {
        id: "track_1",
        ownerSessionId: "host",
        title: "Track 1",
        artist: "Artist 1",
        album: null,
        durationMs: 120_000,
        bitrate: 320_000,
        fileHash: "hash_1",
        mimeType: "audio/mpeg",
        codec: null,
        sizeBytes: 1024,
        artworkUrl: null,
        ownerNickname: "Host",
        sourceType: "local_upload"
      }
    ],
    queue: queue ?? [
      {
        id: "queue_1",
        trackId: "track_1",
        requestedBy: "Host",
        requestedById: "host",
        source: "manual",
        sourceSeedTrackId: null,
        position: 0,
        createdAt: "2026-04-04T00:00:00.000Z"
      }
    ],
    playlists: playlists ?? []
  };
}

function applyEvents(...events: Parameters<typeof roomStateReducer>[1][]) {
  return events.reduce<RoomStateStore>(roomStateReducer, initialRoomStateStore);
}

describe("roomStateReducer", () => {
  it("applies subscribe bootstrap playback and minimal topology before the authoritative snapshot arrives", () => {
    const initial = createRoomSnapshot({
      room: {
        roomRevision: 3,
        presenceRevision: 3,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: null,
            presenceState: "offline",
            permissions: { library: false, queue: false, player: false }
          }
        ]
      }
    });

    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: initial
      },
      {
        type: "subscribe-bootstrap",
        roomId: "room_1",
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: "peer-member",
            presenceState: "online"
          }
        ],
        playback: createPlaybackSnapshot({
          status: "playing",
          currentTrackId: "track_1",
          currentQueueItemId: "queue_1",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          positionMs: 32_000,
          startedAt: "2026-04-04T00:02:00.000Z",
          queueVersion: 2,
          playbackRevision: 2,
          mediaEpoch: 2
        }),
        presenceRevision: 4,
        roomRevision: 4
      }
    );

    expect(state.snapshot?.room.playback.status).toBe("playing");
    expect(state.snapshot?.room.playback.positionMs).toBe(32_000);
    expect(state.snapshot?.room.members[1]?.peerId).toBe("peer-member");
    expect(state.snapshot?.room.members[1]?.permissions).toEqual({
      library: false,
      queue: false,
      player: false
    });
    expect(state.snapshot?.room.presenceRevision).toBe(4);
    expect(state.snapshot?.room.roomRevision).toBe(4);
  });

  it("uses bootstrap handoff as placeholder but lets the first authoritative snapshot replace it", () => {
    const bootstrap = createRoomSnapshot({
      room: {
        roomRevision: 2
      },
      queue: []
    });
    const authoritative = createRoomSnapshot({
      room: {
        roomRevision: 2
      }
    });

    const state = applyEvents(
      {
        type: "bootstrap-handoff",
        snapshot: bootstrap
      },
      {
        type: "server-snapshot",
        snapshot: authoritative
      }
    );

    expect(state.source).toBe("authoritative");
    expect(state.snapshot?.queue).toHaveLength(1);
  });

  it("ignores stale full snapshots by roomRevision", () => {
    const current = createRoomSnapshot({
      room: {
        roomRevision: 5
      }
    });
    const stale = createRoomSnapshot({
      room: {
        roomRevision: 4,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: null,
            presenceState: "offline"
          }
        ]
      }
    });

    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: current
      },
      {
        type: "server-snapshot",
        snapshot: stale
      }
    );

    expect(state.snapshot?.room.roomRevision).toBe(5);
    expect(state.snapshot?.room.members).toHaveLength(2);
  });

  it("does not let an older authoritative snapshot rewind a newer playback patch", () => {
    const initial = createRoomSnapshot({
      room: {
        roomRevision: 5,
        playback: createPlaybackSnapshot({
          status: "playing",
          currentTrackId: "track_1",
          currentQueueItemId: "queue_1",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: "track_1",
          positionMs: 10_000,
          startedAt: "2026-04-17T00:00:00.000Z",
          queueVersion: 4,
          playbackRevision: 4,
          mediaEpoch: 2
        })
      }
    });
    const seekPatch = createPlaybackSnapshot({
      status: "playing",
      currentTrackId: "track_1",
      currentQueueItemId: "queue_1",
      sourceSessionId: "host",
      sourcePeerId: "peer-host",
      sourceTrackId: "track_1",
      positionMs: 60_000,
      startedAt: "2026-04-17T00:00:05.000Z",
      queueVersion: 5,
      playbackRevision: 5,
      mediaEpoch: 2
    });
    const staleSnapshot = createRoomSnapshot({
      room: {
        roomRevision: 5,
        playback: initial.room.playback
      }
    });

    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: initial
      },
      {
        type: "server-playback-patch",
        roomId: "room_1",
        playback: seekPatch
      },
      {
        type: "recover-snapshot",
        snapshot: staleSnapshot
      }
    );

    expect(state.snapshot?.room.playback.positionMs).toBe(60_000);
    expect(state.snapshot?.room.playback.playbackRevision).toBe(5);
  });

  it("applies only newer presence patches and advances roomRevision", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            presenceRevision: 9
          }
        })
      },
      {
        type: "server-presence-patch",
        roomId: "room_1",
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: "peer-member",
            presenceState: "online"
          }
        ],
        playback: createPlaybackSnapshot({
          queueVersion: 2,
          sourceSessionId: "member"
        }),
        presenceRevision: 10,
        roomRevision: 8
      }
    );

    expect(state.snapshot?.room.presenceRevision).toBe(10);
    expect(state.snapshot?.room.roomRevision).toBe(8);
    expect(state.snapshot?.room.members.filter((member) => member.presenceState === "online")).toHaveLength(2);
  });

  it("ignores stale presence patches even if they arrive after a newer authoritative snapshot", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 11,
            presenceRevision: 12,
            members: [
              {
                id: "host",
                nickname: "Host",
                role: "host",
                joinedAt: "2026-04-04T00:00:00.000Z",
                peerId: "peer-host",
                presenceState: "online"
              },
              {
                id: "member",
                nickname: "Member",
                role: "member",
                joinedAt: "2026-04-04T00:01:00.000Z",
                peerId: "peer-member",
                presenceState: "online"
              }
            ]
          }
        })
      },
      {
        type: "server-presence-patch",
        roomId: "room_1",
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: null,
            presenceState: "offline"
          }
        ],
        playback: createPlaybackSnapshot({
          queueVersion: 1
        }),
        presenceRevision: 11,
        roomRevision: 10
      }
    );

    expect(state.snapshot?.room.members[1]?.presenceState).toBe("online");
    expect(state.snapshot?.room.presenceRevision).toBe(12);
  });

  it("keeps newer presence when a later full snapshot carries stale member presence", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 11,
            presenceRevision: 12,
            members: [
              {
                id: "host",
                nickname: "Host",
                role: "host",
                joinedAt: "2026-04-04T00:00:00.000Z",
                peerId: "peer-host",
                presenceState: "online"
              },
              {
                id: "member",
                nickname: "Member",
                role: "member",
                joinedAt: "2026-04-04T00:01:00.000Z",
                peerId: "peer-member",
                presenceState: "online"
              }
            ]
          }
        })
      },
      {
        type: "recover-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 11,
            presenceRevision: 11,
            members: [
              {
                id: "host",
                nickname: "Host",
                role: "host",
                joinedAt: "2026-04-04T00:00:00.000Z",
                peerId: null,
                presenceState: "offline"
              },
              {
                id: "member",
                nickname: "Member",
                role: "member",
                joinedAt: "2026-04-04T00:01:00.000Z",
                peerId: null,
                presenceState: "offline"
              }
            ]
          }
        })
      }
    );

    expect(state.snapshot?.room.members.map((member) => member.presenceState)).toEqual([
      "online",
      "online"
    ]);
    expect(state.snapshot?.room.presenceRevision).toBe(12);
  });

  it("does not let a stale topology patch restore old member permissions", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 11,
            presenceRevision: 12,
            members: [
              {
                id: "host",
                nickname: "Host",
                role: "host",
                joinedAt: "2026-04-04T00:00:00.000Z",
                peerId: "peer-host",
                presenceState: "online"
              },
              {
                id: "member",
                nickname: "Member",
                role: "member",
                joinedAt: "2026-04-04T00:01:00.000Z",
                peerId: "peer-member",
                presenceState: "online",
                permissions: { library: false, queue: false, player: false }
              }
            ]
          }
        })
      },
      {
        type: "server-presence-patch",
        roomId: "room_1",
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: "peer-member",
            presenceState: "online",
            permissions: { library: true, queue: true, player: true }
          }
        ],
        playback: createPlaybackSnapshot(),
        presenceRevision: 13,
        roomRevision: 10
      }
    );

    expect(state.snapshot?.room.members.find((member) => member.id === "member")?.permissions).toEqual({
      library: false,
      queue: false,
      player: false
    });
    expect(state.snapshot?.room.presenceRevision).toBe(12);
    expect(state.snapshot?.room.roomRevision).toBe(11);
  });

  it("keeps playback patches carried by presence events even when presence revision is unchanged", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 12,
            presenceRevision: 12,
            playback: createPlaybackSnapshot({
              status: "paused",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              queueVersion: 3,
              playbackRevision: 3,
              mediaEpoch: 2
            })
          }
        })
      },
      {
        type: "server-presence-patch",
        roomId: "room_1",
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host",
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online"
          },
          {
            id: "member",
            nickname: "Member",
            role: "member",
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: "peer-member",
            presenceState: "online"
          }
        ],
        playback: createPlaybackSnapshot({
          status: "playing",
          currentTrackId: "track_1",
          currentQueueItemId: "queue_1",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: "track_1",
          positionMs: 44_000,
          startedAt: "2026-04-17T00:01:00.000Z",
          queueVersion: 3,
          playbackRevision: 4,
          mediaEpoch: 2
        }),
        presenceRevision: 12,
        roomRevision: 12
      }
    );

    expect(state.snapshot?.room.presenceRevision).toBe(12);
    expect(state.snapshot?.room.playback.status).toBe("playing");
    expect(state.snapshot?.room.playback.positionMs).toBe(44_000);
    expect(state.snapshot?.room.playback.playbackRevision).toBe(4);
  });

  it("updates queue and library only when patch roomRevision is not stale", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 3
          }
        })
      },
      {
        type: "server-queue-patch",
        roomId: "room_1",
        queue: [],
        playback: createPlaybackSnapshot({
          queueVersion: 2
        }),
        roomRevision: 2
      },
      {
        type: "server-library-patch",
        roomId: "room_1",
        tracks: [
          {
            id: "track_2",
            ownerSessionId: "member",
            title: "Track 2",
            artist: "Artist 2",
            album: null,
            durationMs: 240_000,
            bitrate: 256_000,
            fileHash: "hash_2",
            mimeType: "audio/mpeg",
            codec: null,
            sizeBytes: 2048,
            artworkUrl: null,
            ownerNickname: "Member",
            sourceType: "local_upload"
          }
        ],
        queue: [],
        playback: createPlaybackSnapshot({
          currentTrackId: "track_2",
          queueVersion: 3
        }),
        roomRevision: 4
      }
    );

    expect(state.snapshot?.room.roomRevision).toBe(4);
    expect(state.snapshot?.tracks[0]?.id).toBe("track_2");
    expect(state.snapshot?.queue).toHaveLength(0);
  });

  it("keeps playback patches carried by stale queue events without rewinding queue topology", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            playback: createPlaybackSnapshot({
              status: "paused",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              queueVersion: 3,
              playbackRevision: 3
            })
          }
        })
      },
      {
        type: "server-queue-patch",
        roomId: "room_1",
        queue: [],
        playback: createPlaybackSnapshot({
          status: "playing",
          currentTrackId: "track_1",
          currentQueueItemId: "queue_1",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: "track_1",
          positionMs: 12_000,
          startedAt: "2026-04-17T00:03:00.000Z",
          queueVersion: 3,
          playbackRevision: 4
        }),
        roomRevision: 6
      }
    );

    expect(state.snapshot?.queue).toHaveLength(1);
    expect(state.snapshot?.room.roomRevision).toBe(7);
    expect(state.snapshot?.room.playback.status).toBe("playing");
    expect(state.snapshot?.room.playback.playbackRevision).toBe(4);
  });

  it("keeps playback patches carried by stale library events without rewinding library topology", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            playback: createPlaybackSnapshot({
              status: "paused",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              queueVersion: 3,
              playbackRevision: 3
            })
          }
        })
      },
      {
        type: "server-library-patch",
        roomId: "room_1",
        tracks: [],
        queue: [],
        playback: createPlaybackSnapshot({
          status: "playing",
          currentTrackId: "track_1",
          currentQueueItemId: "queue_1",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: "track_1",
          positionMs: 16_000,
          startedAt: "2026-04-17T00:04:00.000Z",
          queueVersion: 3,
          playbackRevision: 4
        }),
        roomRevision: 6
      }
    );

    expect(state.snapshot?.tracks).toHaveLength(1);
    expect(state.snapshot?.queue).toHaveLength(1);
    expect(state.snapshot?.room.roomRevision).toBe(7);
    expect(state.snapshot?.room.playback.status).toBe("playing");
    expect(state.snapshot?.room.playback.playbackRevision).toBe(4);
  });

  it("accepts a fresher library deletion reset even when its playback revision is older", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            playback: createPlaybackSnapshot({
              status: "playing",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              sourceSessionId: "host",
              sourcePeerId: "peer-host",
              sourceTrackId: "track_1",
              queueVersion: 5,
              playbackRevision: 5,
              mediaEpoch: 3
            })
          }
        })
      },
      {
        type: "server-library-patch",
        roomId: "room_1",
        tracks: [],
        queue: [],
        playback: createPlaybackSnapshot({
          status: "paused",
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: null,
          sourcePeerId: null,
          sourceTrackId: null,
          queueVersion: 4,
          playbackRevision: 4,
          mediaEpoch: 4
        }),
        roomRevision: 8
      }
    );

    expect(state.snapshot?.tracks).toHaveLength(0);
    expect(state.snapshot?.queue).toHaveLength(0);
    expect(state.snapshot?.room.playback.currentTrackId).toBeNull();
  });

  it("does not keep deleted current track metadata after a fresh library patch resets playback", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            playback: createPlaybackSnapshot({
              status: "playing",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              sourceSessionId: "host",
              sourcePeerId: "peer-host",
              sourceTrackId: "track_1",
              queueVersion: 5,
              playbackRevision: 5,
              mediaEpoch: 3
            })
          }
        })
      },
      {
        type: "server-library-patch",
        roomId: "room_1",
        tracks: [],
        queue: [],
        playback: createPlaybackSnapshot({
          status: "paused",
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: null,
          sourcePeerId: null,
          sourceTrackId: null,
          queueVersion: 4,
          playbackRevision: 4,
          mediaEpoch: 4
        }),
        roomRevision: 8
      }
    );

    expect(state.snapshot?.tracks.map((track) => track.id)).toEqual([]);
    expect(state.snapshot?.room.playback.currentTrackId).toBeNull();
  });

  it("accepts a fresher queue removal reset even when its playback revision is older", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 7,
            playback: createPlaybackSnapshot({
              status: "playing",
              currentTrackId: "track_1",
              currentQueueItemId: "queue_1",
              sourceSessionId: "host",
              sourcePeerId: "peer-host",
              sourceTrackId: "track_1",
              queueVersion: 5,
              playbackRevision: 5,
              mediaEpoch: 3
            })
          }
        })
      },
      {
        type: "server-queue-patch",
        roomId: "room_1",
        queue: [],
        playback: createPlaybackSnapshot({
          status: "paused",
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: null,
          sourcePeerId: null,
          sourceTrackId: null,
          queueVersion: 4,
          playbackRevision: 4,
          mediaEpoch: 4
        }),
        roomRevision: 8
      }
    );

    expect(state.snapshot?.queue).toHaveLength(0);
    expect(state.snapshot?.room.playback.currentTrackId).toBeNull();
    expect(state.snapshot?.room.playback.currentQueueItemId).toBeNull();
  });

  it("keeps playback patches ordered by playbackRevision", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 2,
            playback: createPlaybackSnapshot({
              status: "paused",
              queueVersion: 3,
              playbackRevision: 3
            })
          }
        })
      },
      {
        type: "server-playback-patch",
        roomId: "room_1",
        playback: createPlaybackSnapshot({
          status: "playing",
          queueVersion: 4,
          playbackRevision: 2
        })
      },
      {
        type: "server-playback-patch",
        roomId: "room_1",
        playback: createPlaybackSnapshot({
          status: "playing",
          queueVersion: 3,
          playbackRevision: 4
        })
      }
    );

    expect(state.snapshot?.room.playback.status).toBe("playing");
    expect(state.snapshot?.room.playback.queueVersion).toBe(3);
    expect(state.snapshot?.room.playback.playbackRevision).toBe(4);
  });

  it("advances roomRevision when server-playback-patch includes roomRevision", () => {
    const state = applyEvents(
      {
        type: "server-snapshot",
        snapshot: createRoomSnapshot({
          room: {
            roomRevision: 5,
            playback: createPlaybackSnapshot({
              status: "paused",
              playbackRevision: 1
            })
          }
        })
      },
      {
        type: "server-playback-patch",
        roomId: "room_1",
        playback: createPlaybackSnapshot({
          status: "playing",
          playbackRevision: 2
        }),
        roomRevision: 8
      }
    );

    expect(state.snapshot?.room.roomRevision).toBe(8);
    expect(state.snapshot?.room.playback.status).toBe("playing");
  });

  it("does not wipe out existing playlists when an authoritative snapshot arrives with empty playlists at the same room revision", () => {
    const existingPlaylist = {
      id: "playlist_1",
      title: "Favorites",
      ownerId: "host",
      description: null,
      coverUrl: null,
      tags: [],
      isCollaborative: false,
      trackIds: [],
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    };

    const initialSnapshot = createRoomSnapshot({
      room: { roomRevision: 5 },
      playlists: [existingPlaylist]
    });

    const currentState: RoomStateStore = {
      snapshot: initialSnapshot,
      source: "authoritative"
    };

    const incomingSnapshotWithEmptyPlaylists = createRoomSnapshot({
      room: { roomRevision: 5 },
      playlists: []
    });

    const state = roomStateReducer(currentState, {
      type: "server-snapshot",
      snapshot: incomingSnapshotWithEmptyPlaylists
    });

    expect(state.snapshot?.playlists).toHaveLength(1);
    expect(state.snapshot?.playlists[0]?.id).toBe("playlist_1");
  });

  it("updates playlists when an authoritative snapshot arrives with non-empty playlists", () => {
    const initialSnapshot = createRoomSnapshot({
      room: { roomRevision: 5 },
      playlists: []
    });

    const currentState: RoomStateStore = {
      snapshot: initialSnapshot,
      source: "authoritative"
    };

    const newPlaylist = {
      id: "playlist_new",
      title: "New Playlist",
      ownerId: "host",
      description: null,
      coverUrl: null,
      tags: [],
      isCollaborative: false,
      trackIds: [],
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    };

    const incomingSnapshotWithPlaylists = createRoomSnapshot({
      room: { roomRevision: 5 },
      playlists: [newPlaylist]
    });

    const state = roomStateReducer(currentState, {
      type: "server-snapshot",
      snapshot: incomingSnapshotWithPlaylists
    });

    expect(state.snapshot?.playlists).toHaveLength(1);
    expect(state.snapshot?.playlists[0]?.id).toBe("playlist_new");
  });

  it("accepts empty playlists when an authoritative snapshot arrives with advanced room revision", () => {
    const existingPlaylist = {
      id: "playlist_1",
      title: "Favorites",
      ownerId: "host",
      description: null,
      coverUrl: null,
      tags: [],
      isCollaborative: false,
      trackIds: [],
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    };

    const initialSnapshot = createRoomSnapshot({
      room: { roomRevision: 5 },
      playlists: [existingPlaylist]
    });

    const currentState: RoomStateStore = {
      snapshot: initialSnapshot,
      source: "authoritative"
    };

    const incomingSnapshotWithDeletedPlaylists = createRoomSnapshot({
      room: { roomRevision: 6 },
      playlists: []
    });

    const state = roomStateReducer(currentState, {
      type: "server-snapshot",
      snapshot: incomingSnapshotWithDeletedPlaylists
    });

    expect(state.snapshot?.playlists).toHaveLength(0);
  });
});
