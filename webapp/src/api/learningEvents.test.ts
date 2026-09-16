import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { learningEventsApi } from "./learningEvents";

const url = `${SUPABASE_URL}/rest/v1/learning_events`;

describe("learningEventsApi", () => {
  beforeEach(() => mockAuthSession("user-1"));
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
});
