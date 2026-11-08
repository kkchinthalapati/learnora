import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { fetchDailyAiUsage, nextUtcDayStart, unitsByTool, utcDayStart } from "./aiUsage";

function rowsResponse(tools: (string | null)[]) {
  return HttpResponse.json(tools.map((tool) => ({ tool, session_key: null })));
}

describe("unitsByTool", () => {
  /* Mirrors billingDecision's unitsToday: one unit per distinct session key,
     plus one per call without a key. The server enforces this; the meter must
     show the same number or it tells a student one thing and blocks them with
     another. */
  it("counts a session-keyed run of calls once, however many parts it took", () => {
    const units = unitsByTool([
      { tool: "learn", session_key: "learn-aaaaaa1" },
      { tool: "learn", session_key: "learn-aaaaaa1" },
      { tool: "learn", session_key: "learn-aaaaaa1" },
      { tool: "learn", session_key: "learn-bbbbbb2" },
    ]);
    expect(units).toEqual({ learn: 2 });
  });

  it("counts a call with no key as its own unit", () => {
    expect(
      unitsByTool([
        { tool: "chat", session_key: null },
        { tool: "chat", session_key: null },
        { tool: "chat", session_key: "chat-sess01" },
      ]),
    ).toEqual({ chat: 3 });
  });

  it("keeps each tool's units separate, and bills a null tool to chat", () => {
    expect(
      unitsByTool([
        { tool: "learn", session_key: "learn-aaaaaa1" },
        { tool: "quiz", session_key: null },
        { tool: null, session_key: null },
      ]),
    ).toEqual({ learn: 1, quiz: 1, chat: 1 });
  });
});

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

  it("counts a session's calls once per tool, as the edge function bills them", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () =>
        HttpResponse.json([
          // One Explain session: a plan, a check and two follow-ups.
          { tool: "debugger", session_key: "s-explain1" },
          { tool: "debugger", session_key: "s-explain1" },
          { tool: "chat", session_key: "s-explain1" },
          { tool: "chat", session_key: "s-explain1" },
          // Two tutor messages, billed one each.
          { tool: "chat", session_key: null },
          { tool: "chat", session_key: null },
          // A three-part note.
          { tool: "notes", session_key: "notes-abc123" },
          { tool: "notes", session_key: "notes-abc123" },
          { tool: "notes", session_key: "notes-abc123" },
        ]),
      ),
    );
    const usage = await fetchDailyAiUsage();
    expect(usage.usedByTool).toEqual({ debugger: 1, chat: 3, notes: 1 });
  });

  it("buckets only this user's rows since midnight UTC, by tool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T09:00:00Z"));

    let url: URL | undefined;
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, ({ request }) => {
        url = new URL(request.url);
        return rowsResponse(["chat", "chat", "quiz", "chat"]);
      }),
    );

    const usage = await fetchDailyAiUsage();

    expect(usage.usedByTool).toEqual({ chat: 3, quiz: 1 });
    expect(usage.resetsAt).toBe("2026-09-05T00:00:00.000Z");
    expect(url?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(url?.searchParams.get("created_at")).toBe(
      "gte.2026-09-04T00:00:00.000Z",
    );
  });

  /* The bug this pins: a three-part Learn lesson wrote three rows, the meter
     read "3 of 3", and the server had spent one lesson. */
  it("shows a Learn lesson as one unit, not one per part", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () =>
        HttpResponse.json([
          { tool: "learn", session_key: "learn-2b1c6f0e1d1a" },
          { tool: "learn", session_key: "learn-2b1c6f0e1d1a" },
          { tool: "learn", session_key: "learn-2b1c6f0e1d1a" },
        ]),
      ),
    );
    await expect(fetchDailyAiUsage()).resolves.toMatchObject({
      usedByTool: { learn: 1 },
    });
  });

  it("bills a null tool (an unmigrated caller) to chat, matching the edge function's default", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () =>
        rowsResponse([null, "chat"]),
      ),
    );
    await expect(fetchDailyAiUsage()).resolves.toMatchObject({
      usedByTool: { chat: 2 },
    });
  });

  it("reports an empty bucket for a user who has generated nothing today", async () => {
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/ai_request_log`, () => rowsResponse([])),
    );
    await expect(fetchDailyAiUsage()).resolves.toMatchObject({
      usedByTool: {},
    });
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
