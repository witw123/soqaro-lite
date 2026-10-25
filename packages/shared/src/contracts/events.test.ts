import { describe, expect, it } from "vitest";
import { roomChatDeletedEventSchema, roomChatEventSchema, roomChatInputPayloadSchema, roomTrackAssetUnavailableEventSchema, websocketEventSchema } from "./events";

describe("websocket event contracts", () => {
  it("accepts room.chat as a declared websocket event", () => {
    expect(websocketEventSchema.parse("room.chat")).toBe("room.chat");
    expect(websocketEventSchema.parse("room.chat.deleted")).toBe("room.chat.deleted");
  });

  it("parses a room.chat event payload", () => {
    expect(
      roomChatEventSchema.parse({
        event: "room.chat",
        payload: {
          id: "chat_1",
          roomId: "room_1",
          senderId: "user_1",
          senderName: "Alice",
          content: "hello",
          timestamp: Date.now()
        }
      })
    ).toMatchObject({
      event: "room.chat",
      payload: {
        id: "chat_1",
        roomId: "room_1",
        senderId: "user_1",
        senderName: "Alice",
        content: "hello"
      }
    });
  });

  it("parses a room.chat.deleted event payload", () => {
    expect(roomChatDeletedEventSchema.parse({
      event: "room.chat.deleted",
      payload: { roomId: "room_1", messageId: "chat_1" }
    })).toEqual({
      event: "room.chat.deleted",
      payload: { roomId: "room_1", messageId: "chat_1" }
    });
  });

  it("trims and validates client room.chat input", () => {
    expect(
      roomChatInputPayloadSchema.parse({
      roomId: "room_1",
        content: " hello "
      })
    ).toEqual({
      roomId: "room_1",
      content: "hello"
    });

    expect(() =>
      roomChatInputPayloadSchema.parse({
        roomId: "room_1",
        senderId: "forged",
        content: ""
      })
    ).toThrow();
  });
  it("parses a room.track.asset.unavailable event payload", () => {
    expect(
      roomTrackAssetUnavailableEventSchema.parse({
        event: "room.track.asset.unavailable",
        payload: {
          roomId: "room_1",
          trackId: "track_1",
          reason: "source-missing"
        }
      })
    ).toEqual({
      event: "room.track.asset.unavailable",
      payload: {
        roomId: "room_1",
        trackId: "track_1",
        reason: "source-missing"
      }
    });
  });
});
