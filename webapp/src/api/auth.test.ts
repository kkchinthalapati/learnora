import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { authApi } from "./auth";

describe("authApi.signup", () => {
  it("rejects with no network call when dob is missing", async () => {
    await expect(authApi.signup("Ada", "ada@example.com", "pw", "")).rejects.toThrow(
      "date of birth",
    );
  });

  it("rejects under-13 signups by calculated age", async () => {
    const twelveYearsAgo = new Date();
    twelveYearsAgo.setFullYear(twelveYearsAgo.getFullYear() - 12);
    const dob = twelveYearsAgo.toISOString().slice(0, 10);

    await expect(
      authApi.signup("Ada", "ada@example.com", "pw", dob),
    ).rejects.toThrow("at least 13 years old");
  });

  it("returns 'verification-sent' when signup succeeds without a session", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/signup`, () =>
        HttpResponse.json({
          user: { id: "u1", identities: [{ id: "i1" }] },
          session: null,
        }),
      ),
    );

    const result = await authApi.signup(
      "Ada",
      "ada@example.com",
      "password123",
      "2000-01-01",
    );
    expect(result).toBe("verification-sent");
  });

  it("returns 'ok' when signup auto-confirms with a session", async () => {
    // GoTrue's /signup response is flat: session fields live at the top
    // level alongside `user`, not nested under a `session` key (confirmed
    // by reading auth-js's `_sessionResponse` transform).
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/signup`, () =>
        HttpResponse.json({
          access_token: "tok",
          refresh_token: "r",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "u1", identities: [{ id: "i1" }] },
        }),
      ),
    );

    const result = await authApi.signup(
      "Ada",
      "ada@example.com",
      "password123",
      "2000-01-01",
    );
    expect(result).toBe("ok");
  });

  /* Supabase obfuscates "this email already exists" by returning a user
   * with an empty identities array instead of an error — the friendly
   * message depends on the caller noticing that, not on `error` being set. */
  it("throws a friendly 'account exists' message for the obfuscated-duplicate shape", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/signup`, () =>
        HttpResponse.json({
          user: { id: "u1", identities: [] },
          session: null,
        }),
      ),
    );

    await expect(
      authApi.signup("Ada", "ada@example.com", "password123", "2000-01-01"),
    ).rejects.toThrow("already exists");
  });
});

describe("authApi.login", () => {
  it("maps invalid-credentials errors to a friendly message", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/token`, () =>
        HttpResponse.json(
          { message: "Invalid login credentials" },
          { status: 400 },
        ),
      ),
    );

    await expect(authApi.login("ada@example.com", "wrong")).rejects.toThrow(
      "Incorrect email or password",
    );
  });
});
