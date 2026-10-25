import { expect, test, type Page } from "@playwright/test";
import { authorizeStorageRoot, stubStorageRootPicker } from "./storage-root";

const session = {
  id: "session_directory_visual",
  userId: "user_directory_visual",
  username: "directory_visual",
  nickname: "夜航主持",
  token: "visual-test-token",
  createdAt: "2026-08-15T00:00:00.000Z"
};

const rooms = [
  {
    room: {
      id: "room_interactive",
      joinCode: "SYNC01",
      name: "深夜共听局",
      description: "一起听歌、聊天，把下一首交给房间。",
      hasPassword: false,
      visibility: "public",
      roomType: "interactive",
      radioAutopilot: { enabled: false },
      directoryHostNickname: "夜航主持",
      directoryMemberCount: 12,
      directoryOnlineMemberCount: 12,
      directoryIsMember: false,
      directoryQueueDepth: 4,
      directoryPendingRequestCount: 0,
      directoryBroadcastState: null,
      directoryNowPlaying: {
        title: "Midnight City",
        artist: "M83",
        artworkUrl: null
      },
      playbackStatus: "playing"
    }
  },
  {
    room: {
      id: "room_request",
      joinCode: "REQ002",
      name: "星空点歌台",
      description: "你点歌，我来放。",
      hasPassword: false,
      visibility: "public",
      roomType: "request",
      radioAutopilot: { enabled: false },
      directoryHostNickname: "夜航主持",
      directoryMemberCount: 8,
      directoryOnlineMemberCount: 8,
      directoryIsMember: false,
      directoryQueueDepth: 3,
      directoryPendingRequestCount: 5,
      directoryBroadcastState: null,
      directoryNowPlaying: {
        title: "The Less I Know The Better",
        artist: "Tame Impala",
        artworkUrl: null
      },
      playbackStatus: "playing"
    }
  },
  {
    room: {
      id: "room_radio",
      joinCode: "AIR003",
      name: "音乐自由台",
      description: "主持人策展播出，陪你听完这一段夜色。",
      hasPassword: false,
      visibility: "public",
      roomType: "radio",
      radioAutopilot: { enabled: false },
      directoryHostNickname: "夜航主持",
      directoryMemberCount: 6,
      directoryOnlineMemberCount: 6,
      directoryIsMember: false,
      directoryQueueDepth: 7,
      directoryPendingRequestCount: 0,
      directoryBroadcastState: "on_air",
      directoryNowPlaying: {
        title: "Everybody Wants To Rule The World",
        artist: "Tears For Fears",
        artworkUrl: null
      },
      playbackStatus: "playing"
    }
  }
];

async function mockDirectoryApi(page: Page) {
  // Single catch-all handler for every /v1 request. Stray authenticated calls
  // (personalization, activities, …) must NOT reach the real server: a live
  // 401 dispatches the auth-expired event, which wipes the mocked session and
  // redirects the page to the login screen mid-test.
  await page.route("**/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/v1/auth/me")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(session) });
      return;
    }
    if (pathname.endsWith("/v1/rooms")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(rooms) });
      return;
    }
    if (pathname.endsWith("/v1/auth/config")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ enabled: false, siteKey: "" }) });
      return;
    }
    if (pathname.endsWith("/v1/playlists")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    if (pathname.includes("/v1/rooms/recent")) {
      await route.fulfill({ contentType: "application/json", body: "null" });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", message: "Not mocked in this e2e scenario." } })
    });
  });
}

test("room directory cards match the visual hierarchy at desktop and mobile", async ({ page }, testInfo) => {
  await stubStorageRootPicker(page);
  await mockDirectoryApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app");
  const cards = page.getByTestId("room-directory-card");
  await authorizeStorageRoot(page, cards.first());
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-room-type="interactive"] [data-card-scene="interactive"]')).toBeVisible();
  await expect(page.locator('[data-room-type="request"] [data-card-scene="request"]')).toBeVisible();
  await expect(page.locator('[data-room-type="radio"] [data-card-scene="radio"]')).toBeVisible();
  await expect(page.getByText("点歌审核", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-room-type="request"]')).toContainText("点歌房");

  for (const card of await cards.all()) {
    await expect(card.getByText(/\d+ 人在线/)).toHaveCount(1);
    await expect(card.locator('[data-testid="room-directory-online-members"]')).toHaveCount(0);
    await expect(card.getByTestId("room-directory-open")).toBeVisible();
    await expect(card.getByText(/OFF AIR|正在收集点歌|等待下一首/)).toHaveCount(0);
  }

  await page.screenshot({ path: testInfo.outputPath("room-directory-reference-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cards.first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("room-directory-reference-mobile.png"), fullPage: true });

  await cards.first().getByTestId("room-directory-open").click();
  await expect(page.getByRole("dialog")).toContainText(rooms[0].room.name);
});
