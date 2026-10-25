import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { authorizeStorageRoot, storageRootAuthorizeLabel, stubStorageRootPicker } from "./storage-root";

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function register(page: Page, nicknamePrefix: string) {
  const id = uniqueId(nicknamePrefix);
  await stubStorageRootPicker(page);
  await page.goto("/auth?redirectTo=/app");
  await page.getByTestId("auth-mode-toggle").click();
  await page.getByTestId("auth-register-username").fill(id);
  await page.getByTestId("auth-register-password").fill("password-123");
  await page.getByTestId("auth-register-nickname").fill(id);
  await page.getByTestId("auth-register-submit").click();
  await authorizeStorageRoot(page, page.getByTestId("create-public-room"));
  return id;
}

async function createRoom(page: Page) {
  await page.getByTestId("create-public-room").click();
  await page.getByPlaceholder("例如：周五夜听").fill("E2E 房间");
  await page.getByTestId("create-room-submit").click();
  await expect(page).toHaveURL(/\/room\/room_/, { timeout: 45_000 });
  const codeButton = page.getByTestId("room-code-button");
  await expect(codeButton).toContainText(/[A-Z0-9]{6}/);
  const code = (await codeButton.innerText()).match(/[A-Z0-9]{6}/)?.[0];
  if (!code) {
    throw new Error("Room join code was not rendered.");
  }
  return code;
}

async function joinRoom(page: Page, joinCode: string) {
  await page.getByTestId("open-join-room-dialog").click();
  await page.getByTestId("join-code-input").fill(joinCode);
  await page.getByTestId("join-code-submit").click();
  await page.getByTestId("room-entry-confirm").click();
  await expect(page).toHaveURL(/\/room\/room_/, { timeout: 45_000 });
  await expect(page.getByTestId("room-code-button")).toContainText(joinCode);
}

async function registerAndJoin(context: BrowserContext, joinCode: string, nicknamePrefix: string) {
  const page = await context.newPage();
  await register(page, nicknamePrefix);
  await joinRoom(page, joinCode);
  return page;
}

function wavFile(name: string, frequencyHz: number) {
  const sampleRate = 44_100;
  // Keep the fixture long enough for playback assertions without making
  // browser-side Opus transcoding dominate the E2E run.
  const durationSeconds = 15;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const amplitude = Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate) * 0.25;
    buffer.writeInt16LE(Math.round(amplitude * 32767), 44 + index * 2);
  }

  return {
    name,
    mimeType: "audio/wav",
    buffer
  };
}

async function uploadTwoTracks(page: Page) {
  await page.getByTestId("room-tab-library").click();
  await page.getByTestId("track-upload-input").setInputFiles([
    wavFile("e2e-tone-a.wav", 440),
    wavFile("e2e-tone-b.wav", 660)
  ]);
  await expect(page.getByTestId("track-card")).toHaveCount(2, { timeout: 90_000 });
}

test("storage-root-gate", async ({ page }) => {
  await stubStorageRootPicker(page);
  const authorizeButton = page.getByRole("button", { name: storageRootAuthorizeLabel });

  // Signed out, the room directory stays browsable: nobody is asked for a root.
  await page.goto("/app");
  await expect(page.getByRole("button", { name: "刷新房间列表" })).toBeVisible();
  await expect(authorizeButton).toHaveCount(0);

  // Signing in hands the app over to the gate until a root is authorized.
  const id = uniqueId("host-storage-root");
  await page.goto("/auth?redirectTo=/app");
  await page.getByTestId("auth-mode-toggle").click();
  await page.getByTestId("auth-register-username").fill(id);
  await page.getByTestId("auth-register-password").fill("password-123");
  await page.getByTestId("auth-register-nickname").fill(id);
  await page.getByTestId("auth-register-submit").click();

  await expect(authorizeButton).toBeVisible();
  await expect(page.getByTestId("create-public-room")).toHaveCount(0);

  await authorizeButton.click();
  await expect(page.getByTestId("create-public-room")).toBeVisible();

  // The authorized root is persisted, so reloading must not gate the app again.
  await page.reload();
  await expect(page.getByTestId("create-public-room")).toBeVisible();
});

test("auth-room-smoke", async ({ page }) => {
  await register(page, "host-smoke");
  await createRoom(page);
  await expect(page.getByTestId("online-member-count")).toHaveText("1");
});

test("two-user-realtime", async ({ browser, page }) => {
  await register(page, "host-realtime");
  const joinCode = await createRoom(page);

  const listenerContext = await browser.newContext();
  const listenerPage = await registerAndJoin(listenerContext, joinCode, "listener-realtime");

  await expect(page.getByTestId("online-member-count")).toHaveText("2", { timeout: 15_000 });
  await expect(listenerPage.getByTestId("online-member-count")).toHaveText("2", { timeout: 15_000 });

  await listenerPage.reload();
  await authorizeStorageRoot(listenerPage, listenerPage.getByTestId("room-code-button"));
  await expect(listenerPage.getByTestId("room-code-button")).toContainText(joinCode);
  await expect(listenerPage.getByTestId("online-member-count")).toHaveText("2", { timeout: 15_000 });
  await listenerContext.close();
});

test("away-room-keeps-live-membership-and-resumes", async ({ browser, page }) => {
  test.setTimeout(90_000);
  await register(page, "host-away");
  const joinCode = await createRoom(page);
  const listenerContext = await browser.newContext();
  const listenerPage = await registerAndJoin(listenerContext, joinCode, "listener-away");

  await expect(page.getByTestId("online-member-count")).toHaveText("2", { timeout: 15_000 });
  await expect(listenerPage.getByTestId("online-member-count")).toHaveText("2", { timeout: 15_000 });

  await page.getByTestId("room-settings-button").click();
  await page.getByTestId("away-room-button").click();
  await expect(page.getByTestId("resume-away-room")).toBeVisible();

  await page.getByRole("link", { name: "返回首页" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByTestId("resume-away-room")).toBeVisible();
  await expect(listenerPage.getByTestId("online-member-count")).toHaveText("2");

  await listenerPage.evaluate(() => {
    const count = document.querySelector('[data-testid="online-member-count"]');
    if (!count) throw new Error("Online member count is not rendered.");
    const values = [count.textContent ?? ""];
    const observer = new MutationObserver(() => values.push(count.textContent ?? ""));
    observer.observe(count, { childList: true, characterData: true, subtree: true });
    (window as Window & { __awayRoomMemberCounts?: string[]; __awayRoomObserver?: MutationObserver }).__awayRoomMemberCounts = values;
    (window as Window & { __awayRoomMemberCounts?: string[]; __awayRoomObserver?: MutationObserver }).__awayRoomObserver = observer;
  });

  await page.getByTestId("resume-away-room").click();
  await expect(page).toHaveURL(/\/room\/room_/);
  await expect(page.getByTestId("room-code-button")).toContainText(joinCode);
  await page.waitForTimeout(2_000);

  const memberCounts = await listenerPage.evaluate(() => {
    const state = window as Window & { __awayRoomMemberCounts?: string[]; __awayRoomObserver?: MutationObserver };
    state.__awayRoomObserver?.disconnect();
    return state.__awayRoomMemberCounts ?? [];
  });
  expect(memberCounts).not.toContain("1");
  await listenerContext.close();
});

test("upload-queue-playback", async ({ browser, page }) => {
  test.setTimeout(120_000);
  await register(page, "host-playback");
  const joinCode = await createRoom(page);
  const listenerContext = await browser.newContext();
  const listenerPage = await registerAndJoin(listenerContext, joinCode, "listener-playback");

  await uploadTwoTracks(page);
  const addButtons = page.getByTestId("track-add-queue-button");
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await page.getByTestId("player-queue-button").last().click();
  await expect(page.getByTestId("queue-item")).toHaveCount(2);
  await listenerPage.getByTestId("player-queue-button").last().click();
  await expect(listenerPage.getByTestId("queue-item")).toHaveCount(2, { timeout: 15_000 });

  await page.getByTestId("queue-item-play-button").first().click();
  await expect(page.getByText("正在播放").first()).toBeVisible({ timeout: 10_000 });
  await expect(listenerPage.getByTestId("queue-item-play-button").first()).toBeDisabled({
    timeout: 15_000
  });

  const playerToggle = page.getByTestId("player-toggle-button").last();
  await expect(playerToggle).toHaveAttribute("title", "暂停", { timeout: 10_000 });
  await playerToggle.click();
  await expect(playerToggle).toHaveAttribute("title", "播放", {
    timeout: 10_000
  });

  const seekSlider = page.getByTestId("player-seek-slider").last();
  await seekSlider.evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "120";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await page.getByTestId("player-next-button").last().click();
  await listenerContext.close();
});

test("delete-room", async ({ browser, page }) => {
  await register(page, "host-delete");
  const joinCode = await createRoom(page);
  const listenerContext = await browser.newContext();
  const listenerPage = await registerAndJoin(listenerContext, joinCode, "listener-delete");

  await page.getByTestId("room-settings-button").click();
  await page.getByTestId("delete-room-button").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "解散房间" }).click();

  await expect(page).toHaveURL(/\/app/);
  await expect(listenerPage).toHaveURL(/\/app/, { timeout: 15_000 });
  await expect(listenerPage.getByTestId("create-public-room")).toBeVisible();
  await listenerContext.close();
});

test("metrics-smoke", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:3001/metrics");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain("soqaro_ws_connections");
  expect(body).toContain("soqaro_active_rooms");
  expect(body).toContain("soqaro_realtime_failures_total");
  expect(body).toContain("soqaro_playback_conflicts_total");
});
