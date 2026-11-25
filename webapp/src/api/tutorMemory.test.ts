import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { resetTutorMemorySupport, tutorMemoryApi } from "./tutorMemory";

const url = `${SUPABASE_URL}/rest/v1/tutor_memory`;
const missing = () =>
  HttpResponse.json(
    { code: "PGRST205", message: "Could not find the table 'public.tutor_memory' in the schema cache" },
    { status: 404 },
  );
const LESSON = { materialId: "m-1", lessonTitle: "Enzymes", subject: "Biology" };

describe("tutorMemoryApi", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTutorMemorySupport();
    mockAuthSession("user-1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads the server's rows, scoped to the current user", async () => {
    let user: string | null = null;
    server.use(
      http.get(url, ({ request }) => {
        user = new URL(request.url).searchParams.get("user_id");
        return HttpResponse.json([
          { material_id: "m-1", lesson_title: "Enzymes", subject: "Biology", times: 2, last_at: "2026-11-09T12:00:00Z" },
        ]);
      }),
    );
    expect(await tutorMemoryApi.list()).toEqual([
      { materialId: "m-1", lessonTitle: "Enzymes", subject: "Biology", times: 2, lastAt: "2026-11-09T12:00:00Z" },
    ]);
    expect(user).toBe("eq.user-1");
  });

  it("writes one row per lesson, with only its title, subject, count and time", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(url, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    await tutorMemoryApi.remember(LESSON);
    expect(body).toMatchObject({
      user_id: "user-1",
      material_id: "m-1",
      lesson_title: "Enzymes",
      subject: "Biology",
      times: 1,
    });
    expect(Object.keys(body ?? {}).sort()).toEqual(
      ["last_at", "lesson_title", "material_id", "subject", "times", "user_id"].sort(),
    );
  });

  it("keeps the memory in this browser until the table exists", async () => {
    let posts = 0;
    server.use(
      http.get(url, missing),
      http.post(url, () => {
        posts += 1;
        return missing();
      }),
    );
    await tutorMemoryApi.remember(LESSON);
    expect(posts).toBe(0);
    expect(await tutorMemoryApi.list()).toMatchObject([{ materialId: "m-1", lessonTitle: "Enzymes", times: 1 }]);

    /* Forgetting works there too. */
    await tutorMemoryApi.forget("m-1");
    expect(await tutorMemoryApi.list()).toEqual([]);
  });

  it("keeps one account's browser copy away from the next account", async () => {
    server.use(http.get(url, missing));
    await tutorMemoryApi.remember(LESSON);
    vi.restoreAllMocks();
    mockAuthSession("user-2");
    expect(await tutorMemoryApi.list()).toEqual([]);
  });

  it("forgets everything on the server and in the browser", async () => {
    let deletedFor: string | null = null;
    server.use(
      http.delete(url, ({ request }) => {
        deletedFor = new URL(request.url).searchParams.get("user_id");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await tutorMemoryApi.forgetAll();
    expect(deletedFor).toBe("eq.user-1");
  });

  it("never throws into a chat when a write fails", async () => {
    server.use(http.post(url, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    await expect(tutorMemoryApi.remember(LESSON)).resolves.toBeUndefined();
  });

  it("tells Settings when a removal did not happen", async () => {
    server.use(http.delete(url, () => HttpResponse.json({ message: "permission denied" }, { status: 403 })));
    await expect(tutorMemoryApi.forget("m-1")).rejects.toThrow("permission denied");
  });
});
