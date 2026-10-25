import { describe, expect, it } from "vitest";
import type { AuthSession } from "@soqaro/shared";
import { areAuthSessionsEqual, isStoredAuthSession } from "./use-session-identity";

const baseSession: AuthSession = {
  id: "user_1",
  userId: "user_1",
  username: "listener",
  nickname: "Listener",
  token: "token_1",
  createdAt: "2026-05-16T00:00:00.000Z"
};

describe("session identity helpers", () => {
  it("accepts a complete stored auth session", () => {
    expect(isStoredAuthSession(baseSession)).toBe(true);
  });

  it("accepts a refreshed auth session without exposing a browser token", () => {
    expect(
      isStoredAuthSession({
        ...baseSession,
        token: ""
      })
    ).toBe(true);
  });

  it("treats equivalent refreshed sessions as unchanged", () => {
    expect(areAuthSessionsEqual(baseSession, { ...baseSession })).toBe(true);
  });

  it("detects changed refreshed sessions", () => {
    expect(
      areAuthSessionsEqual(baseSession, {
        ...baseSession,
        nickname: "New Listener"
      })
    ).toBe(false);
  });
});
