import { getAppSettings } from "@/features/settings/settings-store";
import {
  capacitorPlugin,
  invokeTauri,
  isCapacitorRuntime,
  isTauriRuntime
} from "@/lib/desktop/tauri";

function resolveNotificationArtworkUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  return value.replace(/^http:\/\//i, "https://");
}

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

/**
 * Queries current system notification permission (supporting Android Capacitor native, Tauri OS notifications, and Web).
 */
export async function queryNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined") {
    return "unsupported";
  }

  if (isCapacitorRuntime()) {
    try {
      const plugin = capacitorPlugin("SystemNotification");
      if (plugin?.checkPermissions) {
        const res = (await plugin.checkPermissions()) as { granted?: boolean; permission?: string };
        if (res.granted === true || res.permission === "granted") {
          return "granted";
        }
        if (res.permission === "denied") {
          return "denied";
        }
        return "default";
      }
      return "granted";
    } catch {
      return "granted";
    }
  }

  if (isTauriRuntime()) {
    try {
      const isGranted = await invokeTauri<boolean>("plugin:notification|is_permission_granted");
      return isGranted ? "granted" : "default";
    } catch {
      return "granted";
    }
  }

  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

/**
 * Synchronously checks current system notification permission state.
 */
export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }

  if (isCapacitorRuntime() || isTauriRuntime()) {
    return "granted";
  }

  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

/**
 * Requests notification permission from user (supporting Android Capacitor native prompt, Tauri OS prompts, and Web API).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (isCapacitorRuntime()) {
    try {
      const plugin = capacitorPlugin("SystemNotification");
      if (plugin?.requestPermissions) {
        const res = (await plugin.requestPermissions()) as { granted?: boolean; permission?: string };
        return res.granted === true || res.permission === "granted";
      }
      return true;
    } catch {
      return true;
    }
  }

  if (isTauriRuntime()) {
    try {
      const permission = await invokeTauri<string>("plugin:notification|request_permission");
      return permission === "granted";
    } catch {
      return true;
    }
  }

  if (typeof Notification === "undefined") {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

/**
 * Opens system notification settings on mobile devices.
 */
export async function openMobileNotificationSettings(): Promise<void> {
  if (isCapacitorRuntime()) {
    try {
      const plugin = capacitorPlugin("SystemNotification");
      if (plugin?.openSettings) {
        await plugin.openSettings();
      }
    } catch {
      // Ignored
    }
  }
}

export type TrackNotificationPayload = {
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
};

export type RoomQueueNotificationPayload = {
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  requestedBy: string;
  requestedById?: string | null;
  currentUserId?: string | null;
  roomTitle?: string | null;
};

export type RoomLibraryNotificationPayload = {
  title: string;
  artist?: string | null;
  artworkUrl?: string | null;
  addedBy?: string | null;
  addedById?: string | null;
  currentUserId?: string | null;
  roomTitle?: string | null;
};

export type RoomChatMessageNotificationPayload = {
  senderName: string;
  senderId?: string | null;
  content: string;
  currentUserId?: string | null;
  roomTitle?: string | null;
};

export type RoomMemberPresenceNotificationPayload = {
  nickname: string;
  action: "joined" | "left" | "online" | "offline";
  isHost?: boolean;
  memberId?: string | null;
  currentUserId?: string | null;
  roomTitle?: string | null;
};

let lastNotifiedTrackKey = "";
let lastNotifiedAtMs = 0;

export const NOTIFICATION_ICONS = {
  track: "/icons/notification-track.svg",
  queue: "/icons/notification-queue.svg",
  library: "/icons/notification-library.svg",
  chat: "/icons/notification-chat.svg",
  presence: "/icons/notification-user.svg"
} as const;

const recentNotificationMap = new Map<string, number>();

/**
 * Resets notification deduplication cache (useful for testing).
 */
export function resetNotificationDeduplicationCache() {
  lastNotifiedTrackKey = "";
  lastNotifiedAtMs = 0;
  recentNotificationMap.clear();
}

/**
 * Focuses the main window, restoring it from minimized / background state.
 */
export async function focusMainWindow(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.focus();
  } catch {
    // Ignored in non-browser environments
  }
  if (isTauriRuntime()) {
    try {
      await invokeTauri("focus_main_window");
    } catch {
      // Ignored if command is not available
    }
  }
}

/**
 * Low-level unified notification dispatcher that targets Android Capacitor, Tauri, or Web.
 * Includes global deduplication to prevent duplicate notifications from being fired.
 */
function dispatchSystemToastNotification(
  title: string,
  body: string,
  icon?: string,
  tag = "soqaro-toast"
) {
  if (typeof window === "undefined") return;

  const dedupKey = `${title}:::${body}`;
  const now = Date.now();
  const lastTime = recentNotificationMap.get(dedupKey) ?? 0;
  if (now - lastTime < 2500) {
    return;
  }
  recentNotificationMap.set(dedupKey, now);
  if (recentNotificationMap.size > 100) {
    for (const [k, time] of recentNotificationMap.entries()) {
      if (now - time > 10000) {
        recentNotificationMap.delete(k);
      }
    }
  }

  // 1. Android Capacitor Native Notification
  if (isCapacitorRuntime()) {
    try {
      const plugin = capacitorPlugin("SystemNotification");
      if (plugin?.show) {
        void plugin.show({
          title,
          body,
          artworkUrl: icon
        });
        return;
      }
    } catch {
      // Fallback
    }
  }

  // 2. Tauri Desktop Native Notification
  if (isTauriRuntime()) {
    void invokeTauri("plugin:notification|notify", {
      options: {
        title,
        body,
        icon
      }
    }).catch(() => {
      sendWebNotification(title, body, icon, tag);
    });
    return;
  }

  // 3. Web Browser / PWA Notification
  sendWebNotification(title, body, icon, tag);
}

/**
 * Dispatches a system Toast notification when a track starts playing.
 */
export function notifyTrackChange(payload: TrackNotificationPayload, options?: { force?: boolean }) {
  if (typeof window === "undefined") return;

  const settings = getAppSettings();
  if (!settings.playback.trackChangeNotification) return;
  if (!payload.title || payload.title.trim().length === 0) return;

  const trackKey = `${payload.title}:${payload.artist ?? ""}`;
  const now = Date.now();

  // Avoid duplicate notifications within 2 seconds for the same track
  if (!options?.force && trackKey === lastNotifiedTrackKey && now - lastNotifiedAtMs < 2000) {
    return;
  }

  const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (settings.playback.onlyNotifyInBackground && !options?.force && !isHidden && !isTauriRuntime() && !isCapacitorRuntime()) {
    return;
  }

  lastNotifiedTrackKey = trackKey;
  lastNotifiedAtMs = now;

  const body = payload.artist ? `${payload.artist}` : "Soqaro";
  const icon = resolveNotificationArtworkUrl(payload.artworkUrl) ?? NOTIFICATION_ICONS.track;

  dispatchSystemToastNotification(payload.title, body, icon, "soqaro-now-playing");
}

/**
 * Dispatches a system Toast notification when a member adds/requests a track in a room.
 */
export function notifyRoomQueueTrackAdded(
  payload: RoomQueueNotificationPayload,
  options?: { force?: boolean }
) {
  if (typeof window === "undefined") return;

  const settings = getAppSettings();
  if (!settings.playback.roomQueueNotification) return;
  if (!payload.title || payload.title.trim().length === 0) return;

  // Do not notify if the current user requested the song
  if (payload.currentUserId && payload.requestedById && payload.currentUserId === payload.requestedById) {
    return;
  }

  const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (settings.playback.onlyNotifyInBackground && !options?.force && !isHidden && !isTauriRuntime() && !isCapacitorRuntime()) {
    return;
  }

  const requester = payload.requestedBy || "房间成员";
  const title = `${requester} 点播了新歌曲`;
  const body = payload.artist
    ? `《${payload.title}》 - ${payload.artist}`
    : `《${payload.title}》`;
  const icon = resolveNotificationArtworkUrl(payload.artworkUrl) ?? NOTIFICATION_ICONS.queue;
  const tag = `soqaro-queue-${payload.title}-${Date.now()}`;

  dispatchSystemToastNotification(title, body, icon, tag);
}

/**
 * Dispatches a system Toast notification when a member adds a track to the room library.
 */
export function notifyRoomTrackAddedToLibrary(
  payload: RoomLibraryNotificationPayload,
  options?: { force?: boolean }
) {
  if (typeof window === "undefined") return;

  const settings = getAppSettings();
  if (!settings.playback.roomLibraryNotification) return;
  if (!payload.title || payload.title.trim().length === 0) return;

  if (payload.currentUserId && payload.addedById && payload.currentUserId === payload.addedById) {
    return;
  }

  const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (settings.playback.onlyNotifyInBackground && !options?.force && !isHidden && !isTauriRuntime() && !isCapacitorRuntime()) {
    return;
  }

  const adder = payload.addedBy || "房间成员";
  const title = `${adder} 向曲库添加了新歌曲`;
  const body = payload.artist
    ? `《${payload.title}》 - ${payload.artist}`
    : `《${payload.title}》`;
  const icon = resolveNotificationArtworkUrl(payload.artworkUrl) ?? NOTIFICATION_ICONS.library;
  const tag = `soqaro-library-${payload.title}-${Date.now()}`;

  dispatchSystemToastNotification(title, body, icon, tag);
}

/**
 * Dispatches a system Toast notification when a member sends a chat message in the room.
 */
export function notifyRoomChatMessage(
  payload: RoomChatMessageNotificationPayload,
  options?: { force?: boolean }
) {
  if (typeof window === "undefined") return;

  const settings = getAppSettings();
  if (!settings.playback.roomChatNotification) return;
  if (!payload.content || payload.content.trim().length === 0) return;

  if (payload.currentUserId && payload.senderId && payload.currentUserId === payload.senderId) {
    return;
  }

  const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (settings.playback.onlyNotifyInBackground && !options?.force && !isHidden && !isTauriRuntime() && !isCapacitorRuntime()) {
    return;
  }

  const title = payload.roomTitle
    ? `${payload.senderName} (${payload.roomTitle})`
    : payload.senderName;
  const body = payload.content;
  const icon = NOTIFICATION_ICONS.chat;
  const tag = `soqaro-chat-${Date.now()}`;

  dispatchSystemToastNotification(title, body, icon, tag);
}

/**
 * Dispatches a system Toast notification when a member joins/leaves or changes online presence.
 */
export function notifyRoomMemberPresence(
  payload: RoomMemberPresenceNotificationPayload,
  options?: { force?: boolean }
) {
  if (typeof window === "undefined") return;

  const settings = getAppSettings();
  if (!settings.playback.roomPresenceNotification) return;
  if (!payload.nickname) return;

  if (payload.currentUserId && payload.memberId && payload.currentUserId === payload.memberId) {
    return;
  }

  const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (settings.playback.onlyNotifyInBackground && !options?.force && !isHidden && !isTauriRuntime() && !isCapacitorRuntime()) {
    return;
  }

  const actionText = payload.action === "joined" || payload.action === "online"
    ? "加入了房间"
    : "离开了房间";
  const title = "成员动态";
  const body = payload.roomTitle
    ? `${payload.nickname} ${actionText} (${payload.roomTitle})`
    : `${payload.nickname} ${actionText}`;
  const icon = NOTIFICATION_ICONS.presence;
  const tag = `soqaro-presence-${payload.nickname}-${payload.action}-${Date.now()}`;

  dispatchSystemToastNotification(title, body, icon, tag);
}

function sendWebNotification(title: string, body: string, icon?: string, tag = "soqaro-now-playing") {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      icon,
      silent: true,
      tag
    });
    notification.onclick = () => {
      void focusMainWindow();
    };
    // Auto-dismiss toast after 5 seconds
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // Ignored
      }
    }, 5000);
  } catch {
    // Some browsers require ServiceWorker registration for notifications
  }
}
