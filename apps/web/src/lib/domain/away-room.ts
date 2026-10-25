export const awayRoomStorageKey = "soqaro-away-room";
export const awayRoomChangeEvent = "soqaro-away-room-change";
export const awayRoomResumeStorageKey = "soqaro-away-room-resume";

export function readAwayRoomId() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(awayRoomStorageKey);
  } catch {
    return null;
  }
}

export function storeAwayRoomId(roomId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(awayRoomStorageKey, roomId);
    window.sessionStorage.removeItem(awayRoomResumeStorageKey);
    window.dispatchEvent(new Event(awayRoomChangeEvent));
  } catch {
    // Ignore storage errors in restricted WebView or private environments
  }
}

export function readAwayRoomResumeId() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(awayRoomResumeStorageKey);
  } catch {
    return null;
  }
}

export function requestAwayRoomResume(roomId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(awayRoomResumeStorageKey, roomId);
  } catch {
    // Ignore storage errors
  }
}

export function shouldCommitAwayRoomResume(input: {
  backgroundOnly: boolean;
  initialRoomId: string | null;
  pendingRoomId: string | null;
  storedResumeRoomId: string | null;
}) {
  if (input.backgroundOnly || !input.initialRoomId) {
    return false;
  }

  return input.pendingRoomId === input.initialRoomId ||
    input.storedResumeRoomId === input.initialRoomId;
}

export function clearAwayRoomId() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(awayRoomStorageKey);
    window.sessionStorage.removeItem(awayRoomResumeStorageKey);
    window.dispatchEvent(new Event(awayRoomChangeEvent));
  } catch {
    // Ignore storage errors
  }
}
