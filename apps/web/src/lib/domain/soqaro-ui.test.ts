import { describe, expect, it } from "vitest";
import {
  areSameRoomMembers,
  formatDuration,
  formatTransferRateMBps,
  getOnlineMemberCount,
  getReconnectingMemberCount,
  mergeRoomSnapshot,
  normalizePlaylistTitle,
  removeTracksFromUploads,
  shouldAcceptPresenceSnapshot,
  shouldAcceptPresenceRevision,
  shouldAcceptPlaybackSnapshot,
  shouldReplacePlaybackSnapshot,
  toUserFacingError
} from "./soqaro-ui";

describe("soqaro-ui helpers", () => {
  it("formats Kbps transfer samples as megabytes per second", () => {
    expect(formatTransferRateMBps(15_000)).toBe("1.88 MB/s");
    expect(formatTransferRateMBps(800)).toBe("0.10 MB/s");
    expect(formatTransferRateMBps(null)).toBe("未知");
  });

  it("falls back to the default playlist title when the input is blank", () => {
    expect(normalizePlaylistTitle("   ")).toBe("Tonight Selects");
    expect(normalizePlaylistTitle("夜间精选")).toBe("夜间精选");
  });

  it("maps backend errors to user-facing Chinese copy", () => {
    expect(toUserFacingError(new Error("Nickname already exists in this room"))).toBe(
      "这个昵称已经在房间里被使用了，请换一个再加入。"
    );
    expect(toUserFacingError(new Error("Queue item not found in this room."))).toBe(
      "这首歌已经不在当前播放队列里了。"
    );
    expect(
      toUserFacingError(
        new Error("Track owner is not online, so this song cannot be played right now.")
      )
    ).toBe("这首歌的上传者当前不在线，暂时无法播放。");
  });

  it("removes evicted uploads from the in-memory track map", () => {
    expect(
      removeTracksFromUploads(
        {
          a: { objectUrl: "blob:a" },
          b: { objectUrl: "blob:b" },
          c: { objectUrl: "blob:c" }
        },
        ["b", "c"]
      )
    ).toEqual({
      a: { objectUrl: "blob:a" }
    });
  });

  it("counts room members marked online even before a data peer id is assigned", () => {
    expect(
      getOnlineMemberCount([
        {
          id: "host",
          nickname: "Host",
          role: "host",
          joinedAt: new Date().toISOString(),
          peerId: null,
          presenceState: "online"
        },
        {
          id: "member",
          nickname: "Member",
          role: "member",
          joinedAt: new Date().toISOString(),
          peerId: null,
          presenceState: "offline"
        }
      ])
    ).toBe(1);
  });

  it("counts reconnecting members separately from online members", () => {
    expect(
      getReconnectingMemberCount([
        {
          id: "host",
          nickname: "Host",
          role: "host",
          joinedAt: new Date().toISOString(),
          peerId: "peer-host",
          presenceState: "online"
        },
        {
          id: "member",
          nickname: "Member",
          role: "member",
          joinedAt: new Date().toISOString(),
          peerId: null,
          presenceState: "reconnecting"
        }
      ])
    ).toBe(1);
  });

  it("keeps room list and room page counts stable when a stale duplicate member is present", () => {
    const members = [
      {
        id: "member",
        nickname: "Member",
        role: "member" as const,
        joinedAt: new Date().toISOString(),
        peerId: null,
        presenceState: "offline" as const
      },
      {
        id: "member",
        nickname: "Member",
        role: "member" as const,
        joinedAt: new Date().toISOString(),
        peerId: "peer-member",
        presenceState: "online" as const
      }
    ];

    expect(getOnlineMemberCount(members)).toBe(1);
    expect(getReconnectingMemberCount(members)).toBe(0);
  });

  it("formats milliseconds into player-friendly timestamps", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(61_000)).toBe("1:01");
  });

  it("accepts only presence snapshots that are at least as new as the current revision", () => {
    expect(shouldAcceptPresenceRevision(3, 3)).toBe(true);
    expect(shouldAcceptPresenceRevision(3, 4)).toBe(true);
    expect(shouldAcceptPresenceRevision(4, 3)).toBe(false);
  });

  it("accepts equal-revision presence when the member presence actually changed", () => {
    const currentMembers = [
      {
        id: "host",
        nickname: "Host",
        role: "host" as const,
        joinedAt: "2026-04-04T00:00:00.000Z",
        peerId: "peer-host",
        presenceState: "online" as const
      },
      {
        id: "member",
        nickname: "Member",
        role: "member" as const,
        joinedAt: "2026-04-04T00:01:00.000Z",
        peerId: null,
        presenceState: "offline" as const
      }
    ];
    const incomingMembers = [
      currentMembers[0],
      {
        ...currentMembers[1],
        peerId: "peer-member",
        presenceState: "online" as const
      }
    ];

    expect(areSameRoomMembers(currentMembers, incomingMembers)).toBe(false);
    expect(shouldAcceptPresenceSnapshot(currentMembers, 6, incomingMembers, 6)).toBe(true);
    expect(shouldAcceptPresenceSnapshot(currentMembers, 7, incomingMembers, 6)).toBe(false);
  });

  it("applies fresher topology while still preserving newer playback from an older full room snapshot", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host" as const,
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: null,
            presenceState: "offline" as const
          }
        ],
        presenceRevision: 4,
        playback: {
          status: "playing" as const,
          currentTrackId: "track_new",
          currentQueueItemId: "queue_new",
          sourceSessionId: "host",
          sourcePeerId: "peer_host",
          sourceTrackId: "track_new",
          positionMs: 2000,
          startedAt: "2026-04-04T00:00:10.000Z",
          queueVersion: 8,
          mediaEpoch: 2
        }
      },
      tracks: [],
      queue: [],
      playlists: []
    };
    const incoming = {
      room: {
        ...current.room,
        members: [
          {
            ...current.room.members[0],
            peerId: "peer_host",
            presenceState: "online" as const
          }
        ],
        presenceRevision: 5,
        playback: {
          ...current.room.playback,
          currentTrackId: "track_old",
          currentQueueItemId: "queue_old",
          sourceTrackId: "track_old",
          queueVersion: 7
        }
      },
      tracks: [{ id: "track_old" }],
      queue: [{ id: "queue_old" }],
      playlists: []
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.room.members[0]).toMatchObject({
      peerId: "peer_host",
      presenceState: "online"
    });
    expect(merged.room.presenceRevision).toBe(5);
    expect(merged.room.playback).toMatchObject({
      currentTrackId: "track_new",
      currentQueueItemId: "queue_new",
      queueVersion: 8
    });
    expect(merged.tracks).toContainEqual(
      expect.objectContaining({
        id: "track_old"
      })
    );
    expect(merged.queue).toEqual(incoming.queue);
  });

  it("keeps equal-revision full snapshots when member presence is fresher", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host" as const,
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online" as const
          },
          {
            id: "member",
            nickname: "Member",
            role: "member" as const,
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: null,
            presenceState: "offline" as const
          }
        ],
        presenceRevision: 6,
        playback: {
          status: "paused" as const,
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: null,
          positionMs: 0,
          startedAt: null,
          queueVersion: 4,
          mediaEpoch: 1
        }
      },
      tracks: [],
      queue: [],
      playlists: []
    };
    const incoming = {
      ...current,
      room: {
        ...current.room,
        members: [
          current.room.members[0],
          {
            ...current.room.members[1],
            peerId: "peer-member",
            presenceState: "online" as const
          }
        ],
        presenceRevision: 6
      }
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.room.members[1]).toMatchObject({
      peerId: "peer-member",
      presenceState: "online"
    });
    expect(merged.room.presenceRevision).toBe(6);
  });

  it("applies incoming library changes when the full snapshot carries a newer consistency version", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host" as const,
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online" as const
          }
        ],
        presenceRevision: 3,
        playback: {
          status: "paused" as const,
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: null,
          positionMs: 0,
          startedAt: null,
          queueVersion: 4,
          mediaEpoch: 1
        }
      },
      tracks: [{ id: "track_old" }],
      queue: [{ id: "queue_old" }],
      playlists: []
    };
    const incoming = {
      room: {
        ...current.room,
        members: [...current.room.members],
        playback: {
          ...current.room.playback,
          queueVersion: 5
        }
      },
      tracks: [{ id: "track_new" }],
      queue: [{ id: "queue_new" }],
      playlists: []
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.tracks).toEqual(incoming.tracks);
    expect(merged.queue).toEqual(incoming.queue);
    expect(merged.room.members).toEqual(current.room.members);
    expect(merged.room.playback).toEqual(incoming.room.playback);
  });

  it("does not let a stale join snapshot overwrite a newer online presence state", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host" as const,
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online" as const
          },
          {
            id: "member",
            nickname: "Member",
            role: "member" as const,
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: "peer-member",
            presenceState: "online" as const
          }
        ],
        presenceRevision: 3,
        playback: {
          status: "paused" as const,
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: null,
          positionMs: 0,
          startedAt: null,
          queueVersion: 3,
          mediaEpoch: 1
        }
      },
      tracks: [],
      queue: [],
      playlists: []
    };
    const incoming = {
      ...current,
      room: {
        ...current.room,
        members: [
          current.room.members[0],
          {
            ...current.room.members[1],
            peerId: null,
            presenceState: "offline" as const
          }
        ],
        presenceRevision: 2
      }
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.room.presenceRevision).toBe(3);
    expect(merged.room.members[1]).toMatchObject({
      id: "member",
      peerId: "peer-member",
      presenceState: "online"
    });
  });

  it("keeps active track metadata available when a stale snapshot lacks the current track", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [],
        presenceRevision: 5,
        playback: {
          status: "playing" as const,
          currentTrackId: "track_live",
          currentQueueItemId: "queue_live",
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: "track_live",
          positionMs: 3_000,
          startedAt: "2026-04-04T00:00:00.000Z",
          queueVersion: 9,
          mediaEpoch: 2
        }
      },
      tracks: [],
      queue: [],
      playlists: []
    };
    const incoming = {
      room: {
        ...current.room,
        playback: {
          ...current.room.playback,
          currentTrackId: "track_live",
          currentQueueItemId: "queue_live",
          queueVersion: 8
        }
      },
      tracks: [
        {
          id: "track_live",
          title: "Recovered Track"
        }
      ],
      queue: [],
      playlists: []
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.room.playback.currentTrackId).toBe("track_live");
    expect(merged.tracks).toContainEqual(
      expect.objectContaining({
        id: "track_live",
        title: "Recovered Track"
      })
    );
  });

  it("does not let a stale pre-leave snapshot resurrect a member who already left", () => {
    const current = {
      room: {
        id: "room_1",
        hostId: "host",
        joinCode: "ABC123",
        visibility: "public" as const,
        members: [
          {
            id: "host",
            nickname: "Host",
            role: "host" as const,
            joinedAt: "2026-04-04T00:00:00.000Z",
            peerId: "peer-host",
            presenceState: "online" as const
          }
        ],
        presenceRevision: 5,
        playback: {
          status: "paused" as const,
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: "host",
          sourcePeerId: "peer-host",
          sourceTrackId: null,
          positionMs: 0,
          startedAt: null,
          queueVersion: 5,
          mediaEpoch: 1
        }
      },
      tracks: [],
      queue: [],
      playlists: []
    };
    const incoming = {
      ...current,
      room: {
        ...current.room,
        members: [
          current.room.members[0],
          {
            id: "member",
            nickname: "Member",
            role: "member" as const,
            joinedAt: "2026-04-04T00:01:00.000Z",
            peerId: null,
            presenceState: "offline" as const
          }
        ],
        presenceRevision: 4
      }
    };

    const merged = mergeRoomSnapshot(current as never, incoming as never);

    expect(merged.room.presenceRevision).toBe(5);
    expect(merged.room.members).toHaveLength(1);
    expect(merged.room.members[0]?.id).toBe("host");
  });

  it("replaces the snapshot when an incoming full snapshot belongs to another room", () => {
    const current = {
      room: {
        id: "room_old",
        hostId: "host",
        joinCode: "OLD123",
        visibility: "public" as const,
        members: [],
        presenceRevision: 2,
        playback: {
          status: "paused" as const,
          currentTrackId: null,
          currentQueueItemId: null,
          sourceSessionId: "host",
          sourcePeerId: null,
          sourceTrackId: null,
          positionMs: 0,
          startedAt: null,
          queueVersion: 2,
          mediaEpoch: 0
        }
      },
      tracks: [{ id: "track_old" }],
      queue: [{ id: "queue_old" }],
      playlists: []
    };
    const incoming = {
      room: {
        ...current.room,
        id: "room_new",
        joinCode: "NEW123"
      },
      tracks: [{ id: "track_new" }],
      queue: [{ id: "queue_new" }],
      playlists: [{ id: "playlist_new" }]
    };

    expect(mergeRoomSnapshot(current as never, incoming as never)).toEqual(incoming);
  });

  it("ignores identical playback snapshots at the same version", () => {
    const current = {
      status: "playing" as const,
      currentTrackId: "track_1",
      currentQueueItemId: "queue_1",
      sourceSessionId: "host_1",
      sourcePeerId: "peer_host",
      sourceTrackId: "track_1",
      positionMs: 12_000,
      startedAt: "2026-04-03T12:00:00.000Z",
      queueVersion: 5,
      playbackRevision: 5,
      mediaEpoch: 3
    };

    expect(shouldAcceptPlaybackSnapshot(current, { ...current })).toBe(true);
    expect(shouldReplacePlaybackSnapshot(current, { ...current })).toBe(false);
    expect(
      shouldReplacePlaybackSnapshot(current, {
        ...current,
        sourcePeerId: "peer_host_reconnected"
      })
    ).toBe(true);
    expect(
      shouldAcceptPlaybackSnapshot(current, {
        ...current,
        queueVersion: 6,
        playbackRevision: 6
      })
    ).toBe(true);
  });

  it("accepts the server-confirmed seek timeline over the pending state at the same version", () => {
    const pending = {
      status: "playing" as const,
      currentTrackId: "track_1",
      currentQueueItemId: "queue_1",
      sourceSessionId: "host_1",
      sourcePeerId: "peer_host",
      sourceTrackId: "track_1",
      positionMs: 45_000,
      startAt: null,
      startedAt: null,
      queueVersion: 5,
      playbackRevision: 6,
      mediaEpoch: 3
    };
    const confirmed = {
      ...pending,
      startAt: "2026-07-22T00:00:01.000Z",
      startedAt: "2026-07-22T00:00:01.000Z"
    };

    expect(shouldReplacePlaybackSnapshot(pending, confirmed)).toBe(true);
  });

  it("prefers playbackRevision over queueVersion when ordering playback snapshots", () => {
    const current = {
      status: "playing" as const,
      currentTrackId: "track_1",
      currentQueueItemId: "queue_1",
      sourceSessionId: "host_1",
      sourcePeerId: "peer_host",
      sourceTrackId: "track_1",
      positionMs: 12_000,
      startedAt: "2026-04-03T12:00:00.000Z",
      queueVersion: 9,
      playbackRevision: 9,
      mediaEpoch: 3
    };

    expect(
      shouldAcceptPlaybackSnapshot(current, {
        ...current,
        queueVersion: 8,
        playbackRevision: 10
      })
    ).toBe(true);
  });
});
