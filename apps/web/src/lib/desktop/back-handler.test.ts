import { describe, expect, it } from "vitest";
import { pushBackHandler, resolveBackNavigation, runBackHandler } from "./back-handler";

describe("back handler stack", () => {
  it("reports an unclaimed press so the shell can navigate instead", () => {
    expect(runBackHandler()).toBe(false);
  });

  it("runs the most recently registered handler first", () => {
    const order: string[] = [];
    const removeFirst = pushBackHandler(() => order.push("first"));
    const removeSecond = pushBackHandler(() => order.push("second"));

    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(["second"]);

    removeSecond();
    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(["second", "first"]);

    removeFirst();
    expect(runBackHandler()).toBe(false);
  });

  it("keeps the stack usable when a handler unregisters itself", () => {
    // A handler that closes its overlay unregisters through the effect
    // cleanup, so the list must survive mutation during dispatch.
    const order: string[] = [];
    const removeSelf = pushBackHandler(() => {
      order.push("self-closing");
      removeSelf();
    });
    const removeOuter = pushBackHandler(() => order.push("outer"));

    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(["outer"]);

    removeOuter();
    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(["outer", "self-closing"]);
    expect(runBackHandler()).toBe(false);
  });

  it("drops one registration per unregister when the same handler is pushed twice", () => {
    const order: string[] = [];
    const handler = () => order.push("shared");
    const removeFirst = pushBackHandler(handler);
    const removeSecond = pushBackHandler(handler);

    removeFirst();
    expect(runBackHandler()).toBe(true);
    expect(order).toEqual(["shared"]);

    removeSecond();
    expect(runBackHandler()).toBe(false);
  });
});

describe("back navigation resolution", () => {
  it("quits on the home page even though history exists", () => {
    // The regression this guards: `canGoBack` stays true after any navigation,
    // so trusting it on the home page means back rewinds history forever and
    // never reaches the exit path the user expects on a start destination.
    expect(resolveBackNavigation({ pathname: "/app", canGoBack: true })).toEqual({ action: "exit" });
    expect(resolveBackNavigation({ pathname: "/rooms", canGoBack: true })).toEqual({ action: "exit" });
  });

  it("quits on the home page when there is no history either", () => {
    expect(resolveBackNavigation({ pathname: "/app", canGoBack: false })).toEqual({ action: "exit" });
  });

  it("navigates to the logical parent for app sub-pages regardless of history", () => {
    // 回归守卫:历史栈里有重定向(/ → /app)、上一个房间与 auth 链路,
    // history.back() 会回到与当前页面无关的“上一界面”。
    expect(resolveBackNavigation({ pathname: "/app/discover", canGoBack: true })).toEqual({
      action: "navigate",
      target: "/app"
    });
    expect(resolveBackNavigation({ pathname: "/app/settings", canGoBack: false })).toEqual({
      action: "navigate",
      target: "/app"
    });
    expect(resolveBackNavigation({ pathname: "/app/search", canGoBack: true })).toEqual({
      action: "navigate",
      target: "/app"
    });
  });

  it("navigates a room back to the lobby, even after switching rooms directly", () => {
    // 场景:从房间 A 直接切到房间 B(历史里 A 在 B 之前),
    // 返回必须回到大厅而不是房间 A。
    expect(resolveBackNavigation({ pathname: "/room/abc123", canGoBack: true })).toEqual({
      action: "navigate",
      target: "/app"
    });
  });

  it("quits from the auth page instead of rewinding into the auth chain", () => {
    expect(resolveBackNavigation({ pathname: "/auth", canGoBack: true })).toEqual({ action: "exit" });
  });

  it("falls through to history when the route is not known yet", () => {
    expect(resolveBackNavigation({ pathname: null, canGoBack: true })).toEqual({ action: "history" });
    expect(resolveBackNavigation({ pathname: undefined, canGoBack: true })).toEqual({ action: "history" });
  });

  it("still falls back to history for unknown routes", () => {
    expect(resolveBackNavigation({ pathname: "/unknown-route", canGoBack: true })).toEqual({ action: "history" });
  });
});
