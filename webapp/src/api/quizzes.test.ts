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
});
