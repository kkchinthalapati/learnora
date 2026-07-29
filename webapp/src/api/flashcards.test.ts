import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { flashcardsApi } from "./flashcards";

describe("flashcardsApi", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* Never-reviewed cards have next_review_date = NULL and are due
   * immediately — the request must OR in an `is.null` branch, not just
   * `lte.<now>`, or brand-new decks would undercount. */
  it("counts due cards including never-reviewed (null next_review_date) ones", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.head(`${SUPABASE_URL}/rest/v1/flashcards`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return new HttpResponse(null, {
          status: 200,
          headers: { "content-range": "*/7" },
        });
      }),
    );

    const count = await flashcardsApi.fetchDueCount();

    expect(count).toBe(7);
    expect(capturedUrl?.searchParams.get("or")).toContain("next_review_date.is.null");
  });

  it("fetches all-due cards joined with their deck title, ordered nulls-first", async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/flashcards`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json([
          {
            id: "c1",
            front: "Q",
            back: "A",
            next_review_date: null,
            flashcard_decks: { title: "Biology" },
          },
        ]);
      }),
    );

    const due = await flashcardsApi.fetchAllDue(10);

    expect(due).toHaveLength(1);
    expect(due[0].flashcard_decks?.title).toBe("Biology");
    expect(capturedUrl?.searchParams.get("order")).toBe(
      "next_review_date.asc.nullsfirst",
    );
    expect(capturedUrl?.searchParams.get("limit")).toBe("10");
  });

  it("adds a batch of cards scoped to the user and deck", async () => {
    let capturedBody: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/flashcards`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(capturedBody, { status: 201 });
      }),
    );

    await flashcardsApi.addBatch("deck-1", [{ front: "Q1", back: "A1" }]);

    expect(capturedBody).toEqual([
      { user_id: "user-1", deck_id: "deck-1", front: "Q1", back: "A1" },
    ]);
  });
});
