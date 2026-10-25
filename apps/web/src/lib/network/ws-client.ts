import type { ClientToServerEvents, ServerToClientEvents } from "@soqaro/shared";
import { io, type Socket } from "socket.io-client";
import { createLocalRoomSocket } from "./local-room-socket";

const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "tauri.localhost"]);

function normalizeConfiguredWsBaseUrl(rawUrl: string) {
  return rawUrl.trim().replace(/\/$/, "");
}

function isLocalHostname(hostname: string) {
  return localHostnames.has(hostname.trim().toLowerCase());
}

function shouldPreferCurrentWsOrigin(configuredBaseUrl: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const configured = new URL(configuredBaseUrl, window.location.origin);
    const current = new URL(window.location.origin);
    if (isLocalHostname(configured.hostname) || isLocalHostname(current.hostname)) {
      return false;
    }

    return configured.host !== current.host;
  } catch {
    return true;
  }
}

function getDefaultWsBaseUrl() {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  return "ws://localhost:3001";
}

function resolveWsBaseUrl() {
  const configuredWsBaseUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (!configuredWsBaseUrl) {
    return getDefaultWsBaseUrl();
  }

  const normalizedConfiguredWsBaseUrl = normalizeConfiguredWsBaseUrl(configuredWsBaseUrl);
  if (shouldPreferCurrentWsOrigin(normalizedConfiguredWsBaseUrl)) {
    return getDefaultWsBaseUrl();
  }

  return normalizedConfiguredWsBaseUrl;
}

export const wsBaseUrl = resolveWsBaseUrl();
export const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH ?? "/ws/socket.io";

function resolveCurrentHostname(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname || window.location.host?.split(":")[0] || "localhost";
}

export function createRoomSocket() {
  const configuredWsBaseUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const currentHostname = resolveCurrentHostname();
  let hasRemoteConfig = false;
  if (configuredWsBaseUrl) {
    try {
      const parsed = new URL(configuredWsBaseUrl, "http://localhost");
      hasRemoteConfig = !isLocalHostname(parsed.hostname);
    } catch {
      hasRemoteConfig = false;
    }
  }
  const isLocalStandalone = !hasRemoteConfig && isLocalHostname(currentHostname);

  if (isLocalStandalone && process.env.NODE_ENV !== "test") {
    return createLocalRoomSocket();
  }

  const baseUrl = normalizeSocketBaseUrl(wsBaseUrl, socketPath);

  return io(baseUrl, {
    path: socketPath,
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000
  }) as RoomSocket;
}

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function normalizeSocketBaseUrl(rawUrl: string, configuredPath: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }

    if (
      parsed.pathname !== "/" &&
      configuredPath.startsWith(parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname)
    ) {
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawUrl
      .replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:")
      .replace(/\/$/, "");
  }
}
