import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  FOUNDER_IDS,
  getFounderEmails,
  getFounderProfile,
  isFounder,
} from "./founderAuth";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "student@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as User;
}

describe("founderAuth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset any env variable mutations
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isFounder", () => {
    it("returns false for null or undefined user", () => {
      expect(isFounder(null)).toBe(false);
      expect(isFounder(undefined)).toBe(false);
    });

    it("returns false for regular student users", () => {
      const student = makeUser({ email: "student@example.com", id: "student-123" });
      expect(isFounder(student)).toBe(false);
    });

    it("returns false for arbitrary unlisted emails", () => {
      expect(isFounder(makeUser({ email: "attacker@gmail.com" }))).toBe(false);
      expect(isFounder(makeUser({ email: "karthik@otherdomain.com" }))).toBe(false);
      expect(isFounder(makeUser({ email: "nirav@otherdomain.com" }))).toBe(false);
    });

    it("authorizes Karthik by primary email", () => {
      const user = makeUser({ email: "kk.chinthalapati@gmail.com" });
      expect(isFounder(user)).toBe(true);
    });

    it("authorizes Karthik by company alias email", () => {
      const user = makeUser({ email: "karthik@learnora.dev" });
      expect(isFounder(user)).toBe(true);
    });

    it("authorizes Karthik with uppercase or whitespace email", () => {
      const user = makeUser({ email: "  KK.CHINTHALAPATI@GMAIL.COM  " });
      expect(isFounder(user)).toBe(true);
    });

    it("authorizes Nirav by company email", () => {
      const user = makeUser({ email: "nirav@learnora.dev" });
      expect(isFounder(user)).toBe(true);
    });

    it("authorizes Nirav with uppercase email", () => {
      const user = makeUser({ email: "NIRAV@LEARNORA.DEV" });
      expect(isFounder(user)).toBe(true);
    });

    it("authorizes Karthik by fixture and harness user IDs", () => {
      expect(isFounder(makeUser({ id: "00000000-0000-4000-8000-000000000001", email: undefined }))).toBe(true);
      expect(isFounder(makeUser({ id: "00000000-0000-0000-0000-00000000000a", email: undefined }))).toBe(true);
      expect(isFounder(makeUser({ id: "u-karthik", email: undefined }))).toBe(true);
    });

    it("authorizes Nirav by fixture and harness user IDs", () => {
      expect(isFounder(makeUser({ id: "00000000-0000-4000-8000-000000000002", email: undefined }))).toBe(true);
      expect(isFounder(makeUser({ id: "00000000-0000-0000-0000-00000000000b", email: undefined }))).toBe(true);
      expect(isFounder(makeUser({ id: "u-nirav", email: undefined }))).toBe(true);
    });

    it("authorizes additional emails configured in VITE_FOUNDER_EMAILS", () => {
      const prev = import.meta.env.VITE_FOUNDER_EMAILS;
      try {
        import.meta.env.VITE_FOUNDER_EMAILS = "advisor@learnora.dev, partner@fund.com";
        expect(isFounder(makeUser({ email: "advisor@learnora.dev" }))).toBe(true);
        expect(isFounder(makeUser({ email: "partner@fund.com" }))).toBe(true);
        expect(isFounder(makeUser({ email: "someoneelse@fund.com" }))).toBe(false);
      } finally {
        import.meta.env.VITE_FOUNDER_EMAILS = prev;
      }
    });

    it("handles non-string emails safely without throwing", () => {
      expect(isFounder(makeUser({ email: true as unknown as string }))).toBe(false);
      expect(isFounder(makeUser({ email: 123 as unknown as string }))).toBe(false);
      expect(isFounder(makeUser({ email: {} as unknown as string }))).toBe(false);
    });

    it("rejects non-founder user with founder name in user_metadata in DEV mode", () => {
      const devAttacker = makeUser({
        email: "attacker@evil.com",
        id: "attacker-uuid",
        user_metadata: { full_name: "karthik" },
      });
      expect(isFounder(devAttacker)).toBe(false);
    });

    it("authorizes dev harness user in DEV mode", () => {
      const harnessUser = makeUser({
        email: "harness@learnora.dev",
        id: "harness-uuid",
      });
      expect(isFounder(harnessUser)).toBe(true);
    });
  });

  describe("getFounderProfile", () => {
    it("returns null for non-founder or null user", () => {
      expect(getFounderProfile(null)).toBeNull();
      expect(getFounderProfile(makeUser({ email: "student@example.com" }))).toBeNull();
    });

    it("handles non-string user email safely without throwing", () => {
      const weirdUser = makeUser({
        id: "00000000-0000-4000-8000-000000000001",
        email: true as unknown as string,
      });
      const profile = getFounderProfile(weirdUser);
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe("Karthik");
      expect(profile?.email).toBe("kk.chinthalapati@gmail.com");
    });

    it("returns Karthik's strategy profile when given Karthik's user", () => {
      const user = makeUser({
        id: "00000000-0000-4000-8000-000000000001",
        email: "kk.chinthalapati@gmail.com",
      });
      const profile = getFounderProfile(user);
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe("Karthik");
      expect(profile?.role).toBe("strategy");
      expect(profile?.handle).toBe("karthik");
      expect(profile?.email).toBe("kk.chinthalapati@gmail.com");
    });

    it("returns Nirav's operations profile when given Nirav's user", () => {
      const user = makeUser({
        id: "00000000-0000-4000-8000-000000000002",
        email: "nirav@learnora.dev",
      });
      const profile = getFounderProfile(user);
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe("Nirav");
      expect(profile?.role).toBe("operations");
      expect(profile?.handle).toBe("nirav");
      expect(profile?.email).toBe("nirav@learnora.dev");
    });
  });

  describe("allowlists consistency", () => {
    it("contains default founder emails", () => {
      const emails = getFounderEmails();
      expect(emails).toContain("kk.chinthalapati@gmail.com");
      expect(emails).toContain("karthik@learnora.dev");
      expect(emails).toContain("nirav@learnora.dev");
    });

    it("contains expected founder IDs", () => {
      expect(FOUNDER_IDS).toContain("00000000-0000-4000-8000-000000000001");
      expect(FOUNDER_IDS).toContain("00000000-0000-4000-8000-000000000002");
      expect(FOUNDER_IDS).toContain("u-karthik");
      expect(FOUNDER_IDS).toContain("u-nirav");
    });
  });
});
