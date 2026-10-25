import { expect, test, type Page } from "@playwright/test";
import { authorizeStorageRoot, stubStorageRootPicker } from "./storage-root";

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function register(page: Page) {
  const id = uniqueId("directory-cards");
  await stubStorageRootPicker(page);
  await page.goto("/auth?redirectTo=/app");
  await page.getByTestId("auth-mode-toggle").click();
  await page.getByTestId("auth-register-username").fill(id);
  await page.getByTestId("auth-register-password").fill("password-123");
  await page.getByTestId("auth-register-nickname").fill(id);
  await page.getByTestId("auth-register-submit").click();
  await authorizeStorageRoot(page, page.getByTestId("create-public-room"));
}

async function createRoom(page: Page, roomType: "interactive" | "request" | "radio", name: string) {
  await page.getByTestId("create-public-room").click();
  if (roomType === "request") await page.getByRole("button", { name: "点歌房" }).click();
  if (roomType === "radio") await page.getByRole("button", { name: "自由电台" }).click();
  await page.getByPlaceholder("例如：周五夜听").fill(name);
  await page.getByTestId("create-room-submit").click();
  await expect(page).toHaveURL(/\/room\/room_/, { timeout: 45_000 });
}

test("room directory gives each room format a distinct stage", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await register(page);
  const runId = uniqueId("directory");
  const rooms = (["interactive", "request", "radio"] as const).map((roomType) => ({
    roomType,
    name: `${runId}-${roomType}`
  }));

  for (const room of rooms) {
    await createRoom(page, room.roomType, room.name);
    await page.goto("/app");
    await authorizeStorageRoot(page, page.getByTestId("create-public-room"));
  }

  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const roomType of ["interactive", "request", "radio"] as const) {
    const room = rooms.find((item) => item.roomType === roomType);
    if (!room) throw new Error(`Missing ${roomType} room fixture.`);
    const card = page.getByTestId("room-directory-card").filter({ has: page.getByRole("heading", { name: room.name }) });
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("room-directory-stage")).toHaveAttribute("data-card-scene", roomType);
    await expect(card.getByText(/\d+ 人在线/)).toHaveCount(1);
    await expect(card.getByTestId("room-directory-open")).toHaveAccessibleName(`查看 ${room.name} 的房间详情`);
    await expect(card.getByText(/OFF AIR|正在收集点歌|等待下一首/)).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("room-directory-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: rooms[0].name })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("room-directory-mobile.png"), fullPage: true });
});
