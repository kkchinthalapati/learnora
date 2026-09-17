import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { learningEventsApi } from "./learningEvents";
import { clearOfflineQueue, flushOfflineQueue, getOfflineQueue } from "../lib/offlineSync";

const url = `${SUPABASE_URL}/rest/v1/learning_events`;

describe("learningEventsApi", () => {
  beforeEach(() => { mockAuthSession("user-1"); clearOfflineQueue(); });
  afterEach(() => vi.restoreAllMocks());

  it("records an event scoped to the user with defaults filled", async () => {
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.post(url, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    await learningEventsApi.record({
      topicKey: "enzymes",
      source: "timer",
      minutes: 45,
      deckId: "deck-1",
      clientId: "c-1",
    });
    expect(body?.[0]).toMatchObject({
      user_id: "user-1",
      topic_key: "enzymes",
      source: "timer",
      minutes: 45,
      score: null,
      deck_id: "deck-1",
      folder_id: null,
      client_id: "c-1",
      payload: {},
    });
  });

  it("treats a duplicate client_id as success", async () => {
    server.use(
      http.post(url, () =>
        HttpResponse.json(
          { code: "23505", message: "duplicate key value" },
          { status: 409 },
        ),
      ),
    );
    await expect(
      learningEventsApi.record({ topicKey: "x", source: "timer", clientId: "c" }),
    ).resolves.toBeUndefined();
  });

  it("rejects a score outside 0-1 before sending", async () => {
    await expect(
      learningEventsApi.record({ topicKey: "x", source: "viva", score: 1.4 }),
    ).rejects.toThrow(/score/);
  });

  it("fetches the recent window scoped to the user, newest first", async () => {
    let captured: URL | undefined;
    server.use(
      http.get(url, ({ request }) => {
        captured = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await learningEventsApi.fetchSince(45);
    expect(captured?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(captured?.searchParams.get("order")).toBe("occurred_at.desc");
    expect(captured?.searchParams.get("occurred_at")).toMatch(/^gte\./);
  });

  it("returns [] when the table is missing (migration not applied)", async () => {
    server.use(
      http.get(url, () =>
        HttpResponse.json(
          { code: "42P01", message: "relation does not exist" },
          { status: 404 },
        ),
      ),
    );
    await expect(learningEventsApi.fetchSince()).resolves.toEqual([]);
  });

  it("throws without a session", async () => {
    mockNoAuthSession();
    await expect(learningEventsApi.fetchSince()).rejects.toThrow("Not authenticated");
  });

  it("retains a failed event, feeds the local forecast, and replays with its original timestamp and id", async () => {
    server.use(http.post(url, () => HttpResponse.json({ message: "temporarily unavailable" }, { status: 503 })));
    const at = new Date().toISOString();
    await expect(learningEventsApi.record({ topicKey: "enzymes", source: "quick_check", score: .75, clientId: "retry-1", occurredAt: at })).resolves.toEqual({ queued: true });
    expect(getOfflineQueue()).toHaveLength(1);
    expect(await learningEventsApi.fetchSince()).toEqual([expect.objectContaining({ client_id: "retry-1", occurred_at: at, score: .75 })]);
    let sent: unknown;
    server.use(http.post(url, async ({ request }) => { sent = await request.json(); return new HttpResponse(null, { status: 201 }); }));
    await flushOfflineQueue();
    expect(sent).toEqual([expect.objectContaining({ client_id: "retry-1", occurred_at: at })]);
    expect(getOfflineQueue()).toHaveLength(0);
  });

  it("does not replay another account's queued evidence", async () => {
    server.use(http.post(url, () => HttpResponse.error()));
    await learningEventsApi.record({ topicKey: "private topic", source: "timer", clientId: "owned" });
    mockAuthSession("user-2");
    const send = vi.spyOn(learningEventsApi, "send");
    await flushOfflineQueue();
    expect(send).not.toHaveBeenCalled();
    expect(await learningEventsApi.fetchSince()).toEqual([]);
    expect(getOfflineQueue()).toHaveLength(1);
  });
});
