import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { tasksApi } from "./tasks";
import { taskFixtures } from "../test/mocks/handlers";

describe("tasksApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches tasks scoped to the current user, ordered by id", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json(taskFixtures);
      }),
    );

    const tasks = await tasksApi.fetch();

    expect(tasks).toEqual(taskFixtures);
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(capturedUrl?.searchParams.get("order")).toBe("id.asc");
  });

  it("throws instead of returning [] when the fetch fails", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );

    await expect(tasksApi.fetch()).rejects.toThrow("permission denied");
  });

  it("throws when there is no authenticated session", async () => {
    mockNoAuthSession();
    await expect(tasksApi.fetch()).rejects.toThrow("Not authenticated");
  });

  it("adds a task scoped to the current user with is_done defaulted false", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>[];
        return new HttpResponse(null, { status: 201 });
      }),
    );

    await tasksApi.add("Read chapter 5", "2026-08-10");

    expect(capturedBody).toEqual([
      {
        text: "Read chapter 5",
        is_done: false,
        user_id: "user-1",
        due_date: "2026-08-10",
      },
    ]);
  });

  it("toggles is_done to the opposite of the current status", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedUrl: URL | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
        capturedUrl = new URL(request.url);
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await tasksApi.toggle(1, false);
    expect(capturedUrl?.searchParams.get("id")).toBe("eq.1");
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(capturedBody).toEqual({ is_done: true });
  });

  it("deletes a task by id", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.delete(`${SUPABASE_URL}/rest/v1/tasks`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await tasksApi.delete(1);
    expect(capturedUrl?.searchParams.get("id")).toBe("eq.1");
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
  });

  it("updates task text", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await tasksApi.updateText(1, "Updated text");
    expect(capturedBody).toEqual({ text: "Updated text" });
  });

  it("clears the due date when passed an empty string", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${SUPABASE_URL}/rest/v1/tasks`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await tasksApi.updateDueDate(1, "");
    expect(capturedBody).toEqual({ due_date: null });
  });
});
