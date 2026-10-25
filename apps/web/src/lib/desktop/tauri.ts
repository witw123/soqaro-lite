/**
 * Thin helpers for talking to the Tauri desktop shell. Everything degrades to
 * a no-op in plain browsers so the same bundle serves web, Capacitor mobile,
 * and the Tauri desktop window.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, Record<string, (args?: Record<string, unknown>) => Promise<unknown>> | undefined>;
};

export function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const win = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
}

/** True inside the Capacitor Android/iOS shell (injected Capacitor global). */
export function isCapacitorRuntime() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

export function capacitorPlugin(name: string) {
  if (typeof window === "undefined") return undefined;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.Plugins?.[name];
}

export async function invokeTauri<T = void>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | undefined> {
  if (!isTauriRuntime()) {
    return undefined;
  }
  const win = window as unknown as {
    __TAURI__?: {
      core?: {
        invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __TAURI_INTERNALS__?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const invoke =
    win.__TAURI__?.core?.invoke ??
    win.__TAURI__?.invoke ??
    win.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    return undefined;
  }
  try {
    return (await invoke(command, args)) as T;
  } catch (error) {
    // Surface shell failures in the console; silent failures made toggle
    // buttons look dead during real-device testing.
    console.warn(`[tauri] invoke "${command}" failed:`, error);
    return undefined;
  }
}

export async function listenTauri<T = unknown>(
  event: string,
  handler: (payload: T) => void
): Promise<(() => void) | undefined> {
  if (!isTauriRuntime()) {
    return undefined;
  }
  const win = window as unknown as {
    __TAURI__?: {
      event?: {
        listen?: (
          event: string,
          handler: (e: { payload: T }) => void
        ) => Promise<() => void>;
      };
      listen?: (
        event: string,
        handler: (e: { payload: T }) => void
      ) => Promise<() => void>;
    };
    __TAURI_INTERNALS__?: {
      event?: {
        listen?: (
          event: string,
          handler: (e: { payload: T }) => void
        ) => Promise<() => void>;
      };
    };
  };
  const listen =
    win.__TAURI__?.event?.listen ??
    win.__TAURI__?.listen ??
    win.__TAURI_INTERNALS__?.event?.listen;
  if (!listen) {
    return undefined;
  }
  try {
    const unlisten = await listen(event, (e) => handler(e.payload));
    return unlisten;
  } catch (error) {
    console.warn(`[tauri] listen "${event}" failed:`, error);
    return undefined;
  }
}
