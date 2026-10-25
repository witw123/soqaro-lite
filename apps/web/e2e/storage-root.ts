import { expect, type Locator, type Page } from "@playwright/test";

// `StorageRootGate` holds the signed-in app on /app, /rooms and /room until a
// storage root exists, and a fresh browser context has none: IndexedDB starts
// empty, so a spec that signs in renders the authorization screen instead of
// the app. Every spec that enters the signed-in app therefore has to grant a
// root first.
//
// The real picker cannot be driven headlessly, so `showDirectoryPicker` is
// stubbed with a real OPFS directory handle. It has to be a genuine
// `FileSystemDirectoryHandle`: the app stores it in IndexedDB, which means it
// must be structured-cloneable, and it must survive a reload the same way the
// user's chosen folder does.

export const storageRootAuthorizeLabel = "选择或授权根目录";

// The gate opens the root through IndexedDB before it draws anything, which on
// a loaded CI runner is not instant; and authorizing runs the whole check once
// more after the fake picker returns.
const storageRootTimeoutMs = 20_000;

// How long a rendered app is given to turn out to be the gated one after all.
const storageRootLateGateMs = 2_000;

type PickerStubOptions = { rootName: string };

type DirectoryPickerWindow = Window & {
  showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

function installStorageRootPickerStub({ rootName }: PickerStubOptions) {
  (window as DirectoryPickerWindow).showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(rootName, { create: true });
  };
}

/** Must run before the page's first navigation; safe to call more than once. */
export async function stubStorageRootPicker(page: Page) {
  await page.addInitScript(installStorageRootPickerStub, { rootName: "e2e-storage-root" });
}

/**
 * Presses the gate's authorize button when it is up, and waits for the app
 * behind it to render. A context that already holds an authorized root (a
 * reload, a later navigation) shows no button and needs nothing, so this is a
 * no-op there rather than a failure.
 *
 * `ready` is a locator from the app content behind the gate — the first thing
 * the caller is about to assert on.
 */
export async function authorizeStorageRoot(page: Page, ready: Locator) {
  const button = page.getByRole("button", { name: storageRootAuthorizeLabel });
  // `locator.isVisible()` cannot answer this: it reports the state at the
  // moment it is called and never waits for the element to appear, so its
  // timeout is not a grace period and a gate whose first check is still running
  // looks exactly like an app that never gates. Wait for whichever settled
  // state arrives first instead — the authorize button, or the app itself.
  const appears = (locator: Locator, timeout: number) =>
    locator.waitFor({ state: "visible", timeout }).then(() => true, () => false);
  const settled = await Promise.race([
    appears(button, storageRootTimeoutMs).then((up) => (up ? ("gate" as const) : null)),
    appears(ready, storageRootTimeoutMs).then((up) => (up ? ("app" as const) : null))
  ]);
  if (settled === null) {
    throw new Error("The storage root gate rendered neither its authorize button nor the app: its first check never settled.");
  }
  // The session probe is a request in flight, and the room directory renders
  // for signed-out visitors too: the app can win the race above and be replaced
  // by the gate a moment later, so a rendered app does not yet prove there is
  // no root to authorize. Give the gate that moment before trusting it.
  const lateGate = settled === "app" && (await appears(button, storageRootLateGateMs));
  if (settled === "gate" || lateGate) {
    await button.click();
    await expect(ready, "the storage root gate still blocks the app: no root was authorized").toBeVisible({ timeout: storageRootTimeoutMs });
  }
}
