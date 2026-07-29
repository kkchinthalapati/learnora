import { afterEach, describe, expect, it, vi } from "vitest";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { requireUserId } from "./session";

describe("requireUserId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the session user's id", async () => {
    mockAuthSession("user-42");
    await expect(requireUserId()).resolves.toBe("user-42");
  });

  it("throws when there is no session", async () => {
    mockNoAuthSession();
    await expect(requireUserId()).rejects.toThrow("Not authenticated");
  });
});
