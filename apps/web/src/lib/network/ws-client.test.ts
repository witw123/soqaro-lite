import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ioMock = vi.fn(
  (_url: string, _options: Record<string, unknown>) => ({ connected: false })
);

vi.mock("socket.io-client", () => ({
  io: ioMock
}));

describe("createRoomSocket", () => {
  beforeEach(() => {
    vi.resetModules();
    ioMock.mockClear();
    vi.stubGlobal("window", {
      location: {
        origin: "https://music.example.com",
        protocol: "https:",
        host: "music.example.com"
      },
      localStorage: {
        getItem: vi.fn(() => JSON.stringify({ token: "session-token" }))
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enables websocket first with polling fallback and tighter reconnect cadence", async () => {
    const { createRoomSocket } = await import("./ws-client");

    createRoomSocket();

    expect(ioMock).toHaveBeenCalledWith(
      "https://music.example.com",
      expect.objectContaining({
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8000
      })
    );
  });

  it("converts env-provided websocket origins to http origins for socket.io fallback transports", async () => {
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://realtime.example.com/ws");
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:3000",
        protocol: "http:",
        host: "localhost:3000"
      },
      localStorage: {
        getItem: vi.fn(() => JSON.stringify({ token: "session-token" }))
      }
    });
    const { createRoomSocket } = await import("./ws-client");

    createRoomSocket();

    expect(ioMock).toHaveBeenCalledWith(
      "https://realtime.example.com",
      expect.objectContaining({
        path: "/ws/socket.io"
      })
    );
    vi.unstubAllEnvs();
  });

  it("ignores stale production websocket env values when the current page is on a different non-local origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://soqaro.example.test");
    const { createRoomSocket } = await import("./ws-client");

    createRoomSocket();

    expect(ioMock).toHaveBeenCalledWith(
      "https://music.example.com",
      expect.objectContaining({
        path: "/ws/socket.io"
      })
    );
    vi.unstubAllEnvs();
  });
});
