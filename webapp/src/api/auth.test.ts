import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { authApi } from "./auth";

describe("authApi.signup", () => {
  it("rejects with no network call when dob is missing", async () => {
    await expect(
      authApi.signup("Ada", "ada@example.com", "pw", "", true),
    ).rejects.toThrow("date of birth");
  });

  it("rejects under-13 signups by calculated age", async () => {
    const twelveYearsAgo = new Date();
    twelveYearsAgo.setFullYear(twelveYearsAgo.getFullYear() - 12);
    const dob = twelveYearsAgo.toISOString().slice(0, 10);

    await expect(
      authApi.signup("Ada", "ada@example.com", "pw", dob, true),
    ).rejects.toThrow("at least 13 years old");
  });

  /* `NaN < 13` is false, so an unparseable date sails past a bare
     comparison — it needs rejecting on its own terms. */
  it("rejects an unparseable date of birth rather than waving it through", async () => {
    await expect(
      authApi.signup("Ada", "ada@example.com", "pw", "not-a-date", true),
    ).rejects.toThrow("valid date of birth");
  });

  /* The birthday boundary.
   *
   * These pin the behaviour the UTC-parsing fix exists for: the gate has to
   * read "YYYY-MM-DD" as that calendar date, not as UTC midnight. Note that
   * they can only *fail* on a machine whose zone is behind UTC — where
   * `new Date("2013-08-31")` reads back as the 30th and the old code let
   * someone in the day before they turned 13. Under this suite's UTC runner
   * the two readings coincide, so treat these as a statement of the intended
   * boundary rather than as a reproduction of the bug. `process.env.TZ`
   * cannot stand in for a real zone here: V8 has already cached the offset
   * by the time a test body runs, and the worker ignores the reassignment. */
  function localDob(yearsAgo: number, dayOffset = 0): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    d.setDate(d.getDate() + dayOffset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  it("rejects someone whose 13th birthday is tomorrow", async () => {
    await expect(
      authApi.signup("Ada", "ada@example.com", "pw", localDob(13, 1), true),
    ).rejects.toThrow("at least 13 years old");
  });

  it("accepts someone whose 13th birthday is today", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/signup`, () =>
        HttpResponse.json({
          user: { id: "u1", identities: [{ id: "i1" }] },
          session: null,
        }),
      ),
    );

    await expect(
      authApi.signup(
        "Ada",
        "ada@example.com",
        "password123",
        localDob(13),
        true,
      ),
    ).resolves.toBe("verification-sent");
  });

  it("rejects signup when AI-provider consent was not given", async () => {
    await expect(
      authApi.signup(
        "Ada",
        "ada@example.com",
        "password123",
        "2000-01-01",
        false,
      ),
    ).rejects.toThrow("agree to share your study data");
  });

  it("sends consent_given in the signup metadata", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${SUPABASE_URL}/auth/v1/signup`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          user: { id: "u1", identities: [{ id: "i1" }] },
          session: null,
        });
      }),
    );

    await authApi.signup(
      "Ada",
      "ada@example.com",
      "password123",
      "2000-01-01",
      true,
    );

    expect(body).toMatchObject({ data: { consent_given: true } });
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
      true,
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
      true,
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
      authApi.signup(
        "Ada",
        "ada@example.com",
        "password123",
        "2000-01-01",
        true,
      ),
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
