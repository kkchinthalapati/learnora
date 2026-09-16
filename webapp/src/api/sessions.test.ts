import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { sessionsApi } from "./sessions";

describe("sessionsApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a session scoped to the user", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(
        `${SUPABASE_URL}/rest/v1/study_sessions`,
        async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>[];
          return HttpResponse.json(null, { status: 201 });
        },
      ),
    );

    await sessionsApi.log({
      minutes: 25,
      task: "Enzymes",
      folderId: "folder-1",
    });

    expect(capturedBody?.[0]).toMatchObject({
      user_id: "user-1",
      task: "Enzymes",
      folder_id: "folder-1",
      minutes: 25,
    });
  });

  it("records a timer learning event after logging the session", async () => {
    let eventBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/study_sessions`, () =>
        HttpResponse.json(null, { status: 201 }),
      ),
      http.post(
        `${SUPABASE_URL}/rest/v1/learning_events`,
        async ({ request }) => {
          eventBody = (await request.json()) as Record<string, unknown>[];
          return HttpResponse.json(null, { status: 201 });
        },
      ),
    );
    await sessionsApi.log({
      minutes: 45,
      task: "Enzymes",
      folderId: "folder-1",
      deckId: "deck-1",
      clientId: "sess-1",
    });
    expect(eventBody?.[0]).toMatchObject({
      source: "timer",
      minutes: 45,
      topic_key: "enzymes",
      deck_id: "deck-1",
      folder_id: "folder-1",
      client_id: "sess-1",
    });
  });

  it("does not record an event for a session with no task", async () => {
    let hit = false;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/learning_events`, () => {
        hit = true;
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    await sessionsApi.log({ minutes: 25, task: null });
    expect(hit).toBe(false);
  });

  it("still resolves when the event write fails", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/learning_events`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    await expect(
      sessionsApi.log({ minutes: 25, task: "Enzymes" }),
    ).resolves.toBeUndefined();
  });
});
