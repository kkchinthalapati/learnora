import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { fetchDailyAiUsage, nextUtcDayStart, utcDayStart } from "./aiUsage";

/** A `head: true` count comes back in the content-range header, not the body. */
function countResponse(total: number) {
  return new HttpResponse(null, {
    status: 200,
    headers: { "content-range": `0-0/${total}` },
  });
}

describe("utcDayStart / nextUtcDayStart", () => {
  it("floors to midnight UTC, matching what the edge function counts from", () => {
    const start = utcDayStart(new Date("2026-09-04T13:47:31.500Z"));
    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("is a no-op on an instant already at midnight UTC", () => {
    const start = utcDayStart(new Date("2026-09-04T00:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("rolls the reset over the month boundary", () => {
    expect(
      nextUtcDayStart(new Date("2026-09-30T23:59:59Z")).toISOString(),
    ).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rolls the reset over the year boundary", () => {
    expect(
      nextUtcDayStart(new Date("2026-12-31T12:00:00Z")).toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
  });

  /* Late-evening local time in a positive-offset zone is already "tomorrow"
     in UTC. The reset must follow UTC, because that is the boundary the
     server enforces — showing a local midnight would be the wrong deadline. */
  it("follows UTC rather than the local calendar day", () => {
    const start = utcDayStart(new Date("2026-09-04T23:30:00Z"));
    expect(start.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });
});

describe("fetchDailyAiUsage", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("counts only this user's rows since midnight UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T09:00:00Z"));

    let url: URL | undefined;
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, ({ request }) => {
        url = new URL(request.url);
        return countResponse(17);
      }),
    );

    const usage = await fetchDailyAiUsage();

    expect(usage.used).toBe(17);
    expect(usage.resetsAt).toBe("2026-09-05T00:00:00.000Z");
    expect(url?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(url?.searchParams.get("created_at")).toBe(
      "gte.2026-09-04T00:00:00.000Z",
    );
  });

  it("reports zero for a user who has generated nothing today", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () =>
        countResponse(0),
      ),
    );
    await expect(fetchDailyAiUsage()).resolves.toMatchObject({ used: 0 });
  });

  /* Throwing matters: the hook renders "couldn't read your usage" on an
     error, and silently reporting 0 would instead tell someone who is out of
     generations that they have a full day's budget. */
  it("throws rather than reporting a zero it cannot stand behind", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    await expect(fetchDailyAiUsage()).rejects.toThrow("permission denied");
  });
});
