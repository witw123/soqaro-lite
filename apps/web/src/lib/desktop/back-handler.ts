/**
 * Last-in-first-out registry for hardware back presses (Capacitor Android).
 *
 * Overlays register a handler while they are open; the shell's back listener
 * runs the most recently registered one, so back dismisses the top-most
 * surface before it ever reaches navigation. Handlers are *not* removed here:
 * closing the overlay is what unregisters it, which keeps ownership with the
 * component and avoids double-closing when a handler is also wired to Escape.
 */

type BackHandler = () => void;

const handlers: BackHandler[] = [];

/** Registers `handler` on top of the stack; call the result to unregister. */
export function pushBackHandler(handler: BackHandler) {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  };
}

/**
 * Runs the top-most handler. Returns false when nothing is registered, which
 * tells the caller the press belongs to navigation instead.
 */
export function runBackHandler() {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

/**
 * Routes that render the rooms home page — the app's start destination. Both
 * are listed because `/app` and `/rooms` render the same page.
 */
const homePaths = ["/app", "/rooms"];

export type BackNavigationDecision =
  | { action: "exit" }
  | { action: "history" }
  | { action: "navigate"; target: string };

/**
 * Decides where a back press goes once no overlay has claimed it.
 *
 * 返回走“逻辑父级”而不是 WebView 历史:历史栈里混着重定向(/ → /app)、
 * 上一个房间、auth 链路等条目,history.back() 会回到与当前页面无关的
 * “上一界面”,造成各处返回互相干扰。已知路由一律映射到确定的父级,
 * 仅未知路由才回退到历史,无历史可退时双击退出。
 */
export function resolveBackNavigation(input: {
  pathname: string | null | undefined;
  canGoBack: boolean | undefined;
}): BackNavigationDecision {
  const pathname = typeof input.pathname === "string" ? input.pathname : null;
  if (pathname === null) {
    return { action: "history" };
  }
  if (homePaths.includes(pathname)) {
    return { action: "exit" };
  }
  // 房间与 /app 子页的父级都是大厅:进房/切房/深链之后,返回永远回到大厅,
  // 而不是历史里的上一个房间或登录前的页面。
  if (pathname.startsWith("/room/")) {
    return { action: "navigate", target: "/app" };
  }
  if (pathname === "/app/profile/playlists") {
    // 二级页的父级是它所在的板块,不是大厅。
    return { action: "navigate", target: "/app/profile" };
  }
  if (pathname.startsWith("/app/")) {
    return { action: "navigate", target: "/app" };
  }
  if (pathname === "/auth") {
    // 登录/注册页没有“上一界面”:历史里是重定向或外部来源。
    return { action: "exit" };
  }
  return input.canGoBack ? { action: "history" } : { action: "exit" };
}
