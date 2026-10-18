import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { needsAccountDetails } from "./accountDetails";

function user(app: Record<string, unknown>, meta: Record<string, unknown>): User {
  return { id: "u", app_metadata: app, user_metadata: meta } as unknown as User;
}

describe("needsAccountDetails", () => {
  it("asks a new Google account for its date of birth and consent", () => {
    expect(needsAccountDetails(user({ provider: "google" }, {}))).toBe(true);
  });

  it("is satisfied once both are stored, even when consent is refused", () => {
    expect(
      needsAccountDetails(
        user({ provider: "google" }, { dob: "2010-03-04", consent_given: false }),
      ),
    ).toBe(false);
  });

  it("leaves email accounts and older accounts alone", () => {
    expect(needsAccountDetails(user({ provider: "email" }, {}))).toBe(false);
    expect(needsAccountDetails(null)).toBe(false);
  });
});
