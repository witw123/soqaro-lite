import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPermissionState,
  notifyRoomQueueTrackAdded,
  notifyRoomTrackAddedToLibrary,
  notifyRoomChatMessage,
  notifyRoomMemberPresence,
  notifyTrackChange,
  requestNotificationPermission
} from "./system-notifications";
import { updateAppSettings } from "@/features/settings/settings-store";

describe("system notifications", () => {
  const createMockDocument = (visibilityState = "hidden") => ({
    visibilityState,
    documentElement: {
      dataset: {},
      style: {
        setProperty: vi.fn(),
        removeProperty: vi.fn()
      },
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn()
      }
    }
  });

  const createMockWindow = (mockNotification?: unknown) => {
    const storage = new Map<string, string>();
    return {
      Notification: mockNotification,
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear()
      },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns unsupported when window.Notification is missing", () => {
    vi.stubGlobal("window", createMockWindow(undefined));
    vi.stubGlobal("Notification", undefined);
    expect(getNotificationPermissionState()).toBe("unsupported");
  });

  it("requests notification permission when supported", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    class MockNotification {
      static permission = "default";
      static requestPermission = requestPermission;
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);

    const granted = await requestNotificationPermission();
    expect(granted).toBe(true);
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("dispatches Toast notification in background when enabled", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { trackChangeNotification: true } });

    notifyTrackChange(
      {
        title: "晴天",
        artist: "周杰伦",
        artworkUrl: "/covers/jay.jpg"
      },
      { force: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith("晴天", expect.objectContaining({
      body: "周杰伦",
      silent: true,
      tag: "soqaro-now-playing"
    }));
  });

  it("does not dispatch notification when trackChangeNotification is disabled", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { trackChangeNotification: false } });

    notifyTrackChange(
      {
        title: "晴天",
        artist: "周杰伦"
      },
      { force: true }
    );

    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it("dispatches room queue notification when requested by another member", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomQueueNotification: true } });

    notifyRoomQueueTrackAdded(
      {
        title: "七里香",
        artist: "周杰伦",
        requestedBy: "Alice",
        requestedById: "user_alice",
        currentUserId: "user_me"
      },
      { force: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith("Alice 点播了新歌曲", expect.objectContaining({
      body: "《七里香》 - 周杰伦",
      silent: true
    }));
  });

  it("suppresses room queue notification when requested by current user", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomQueueNotification: true } });

    notifyRoomQueueTrackAdded(
      {
        title: "七里香",
        artist: "周杰伦",
        requestedBy: "Me",
        requestedById: "user_me",
        currentUserId: "user_me"
      },
      { force: true }
    );

    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it("dispatches room library notification when a track is added by another member", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomLibraryNotification: true } });

    notifyRoomTrackAddedToLibrary(
      {
        title: "夜曲",
        artist: "周杰伦",
        addedBy: "Bob",
        addedById: "user_bob",
        currentUserId: "user_me"
      },
      { force: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith("Bob 向曲库添加了新歌曲", expect.objectContaining({
      body: "《夜曲》 - 周杰伦",
      silent: true
    }));
  });

  it("dispatches room chat notification when a message is received from another member", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomChatNotification: true } });

    notifyRoomChatMessage(
      {
        senderName: "Charlie",
        senderId: "user_charlie",
        content: "大家好！这首歌太好听了",
        currentUserId: "user_me",
        roomTitle: "深夜放映室"
      },
      { force: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith("Charlie (深夜放映室)", expect.objectContaining({
      body: "大家好！这首歌太好听了"
    }));
  });

  it("dispatches room member presence notification when a member joins", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomPresenceNotification: true } });

    notifyRoomMemberPresence(
      {
        nickname: "David",
        action: "joined",
        memberId: "user_david",
        currentUserId: "user_me",
        roomTitle: "音乐小憩"
      },
      { force: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith("成员动态", expect.objectContaining({
      body: "David 加入了房间 (音乐小憩)"
    }));
  });

  it("deduplicates identical notification events fired in rapid succession", () => {
    const mockConstructor = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        mockConstructor(title, options);
      }
    }
    vi.stubGlobal("window", createMockWindow(MockNotification));
    vi.stubGlobal("Notification", MockNotification);
    vi.stubGlobal("document", createMockDocument("hidden"));

    updateAppSettings({ playback: { roomChatNotification: true } });

    // Fire duplicate chat message twice
    notifyRoomChatMessage({
      senderName: "Eve",
      senderId: "user_eve",
      content: "测试消息",
      currentUserId: "user_me"
    });

    notifyRoomChatMessage({
      senderName: "Eve",
      senderId: "user_eve",
      content: "测试消息",
      currentUserId: "user_me"
    });

    expect(mockConstructor).toHaveBeenCalledTimes(1);
  });
});

