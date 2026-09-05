import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { quizzesApi } from "./quizzes";

describe("quizzesApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws on a failed insert", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/quizzes`, () =>
        HttpResponse.json({ message: "not-null violation" }, { status: 400 }),
      ),
    );
    await expect(quizzesApi.add(null, null, "Quiz", [])).rejects.toThrow(
      "not-null violation",
    );
  });

  it("deletes a quiz by id", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.delete(`${SUPABASE_URL}/rest/v1/quizzes`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await quizzesApi.delete("quiz-1");
    expect(capturedUrl?.searchParams.get("id")).toBe("eq.quiz-1");
    expect(capturedUrl?.searchParams.get("user_id")).toBe("eq.user-1");
  });

  /* Client-side aggregation over the last 30 attempts — worth testing on its
   * own since it's real logic, not just a passthrough query. */
  it("tallies weak topics across recent attempts, most-frequent first", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/quiz_attempts`, () =>
        HttpResponse.json([
          { weak_topics: ["mitosis", "genetics"] },
          { weak_topics: ["mitosis"] },
          { weak_topics: null },
          { weak_topics: ["genetics", "mitosis"] },
        ]),
      ),
    );

    const topics = await quizzesApi.fetchWeakTopics(2);

    expect(topics).toEqual([
      { topic: "mitosis", count: 3 },
      { topic: "genetics", count: 2 },
    ]);
  });

  it("throws (rather than the vanilla's silent []) when the weak-topics query errors", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/quiz_attempts`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    await expect(quizzesApi.fetchWeakTopics()).rejects.toThrow("boom");
  });

  describe("recordAttempt", () => {
    it("sends the attempt key so a replay can be recognised", async () => {
      let body: Record<string, unknown>[] | undefined;
      server.use(
        http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        }),
      );

      await quizzesApi.recordAttempt("quiz-1", 3, 5, [], ["kinetics"], "run-1");

      expect(body?.[0]).toMatchObject({
        quiz_id: "quiz-1",
        score: 3,
        total: 5,
        attempt_key: "run-1",
      });
    });

    /* Omitted rather than sent as null: the uniqueness index is partial on
       `attempt_key is not null`, so a null would be legal but pointless. */
    it("omits the key entirely when there is no run to key on", async () => {
      let body: Record<string, unknown>[] | undefined;
      server.use(
        http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>[];
          return new HttpResponse(null, { status: 201 });
        }),
      );

      await quizzesApi.recordAttempt("quiz-1", 3, 5, [], []);

      expect(body?.[0]).not.toHaveProperty("attempt_key");
    });

    /* The whole point of the key: the second write of one run must look like
       success to the caller, because the attempt *is* recorded — the first
       write put it there. Throwing would show an error over a saved score. */
    it("treats a duplicate as success rather than an error", async () => {
      server.use(
        http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, () =>
          HttpResponse.json(
            {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "quiz_attempts_user_attempt_key_idx"',
            },
            { status: 409 },
          ),
        ),
      );

      await expect(
        quizzesApi.recordAttempt("quiz-1", 3, 5, [], [], "run-1"),
      ).resolves.toBeUndefined();
    });

    it("still surfaces a genuine failure", async () => {
      server.use(
        http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, () =>
          HttpResponse.json({ message: "permission denied" }, { status: 403 }),
        ),
      );

      await expect(
        quizzesApi.recordAttempt("quiz-1", 3, 5, [], [], "run-1"),
      ).rejects.toThrow("permission denied");
    });
  });
});
