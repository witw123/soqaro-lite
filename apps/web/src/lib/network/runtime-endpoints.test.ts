import { describe, expect, it, vi } from "vitest";

describe("runtime endpoint fallbacks", () => {
  it("falls back to the current page origin for API requests", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: {
        origin: "https://example.com",
        protocol: "https:",
        host: "example.com"
      }
    });

    const module = await import("./api-client");
    expect(module.apiBaseUrl).toBe("https://example.com");
  });

  it("falls back to a matching same-origin websocket endpoint", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: {
        origin: "https://example.com",
        protocol: "https:",
        host: "example.com"
      },
      localStorage: {
        getItem: vi.fn(() => null)
      }
    });

    const module = await import("./ws-client");
    expect(module.wsBaseUrl).toBe("wss://example.com");
  });

  it("prefers the current page origin when a stale production API origin is baked into the bundle", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://soqaro.example.test");
    vi.stubGlobal("window", {
      location: {
        origin: "https://soqaro.example.test",
        protocol: "https:",
        host: "soqaro.example.test"
      }
    });

    const module = await import("./api-client");
    expect(module.apiBaseUrl).toBe("https://soqaro.example.test");
    vi.unstubAllEnvs();
  });

  it("prefers the current page websocket origin when a stale production websocket origin is baked into the bundle", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://soqaro.example.test");
    vi.stubGlobal("window", {
      location: {
        origin: "https://soqaro.example.test",
        protocol: "https:",
        host: "soqaro.example.test"
      },
      localStorage: {
        getItem: vi.fn(() => null)
      }
    });

    const module = await import("./ws-client");
    expect(module.wsBaseUrl).toBe("wss://soqaro.example.test");
    vi.unstubAllEnvs();
  });
});
