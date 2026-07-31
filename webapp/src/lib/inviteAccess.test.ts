import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasInviteAccess } from "./inviteAccess";

describe("hasInviteAccess", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is false with no stored flag", () => {
    expect(hasInviteAccess()).toBe(false);
  });

  it("is true once the flag is set", () => {
    localStorage.setItem("learnora_invite_access", "true");
    expect(hasInviteAccess()).toBe(true);
  });

  it("fails closed if localStorage itself throws", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    expect(hasInviteAccess()).toBe(false);

    getItemSpy.mockRestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
