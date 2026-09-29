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
    expect(capturedUrl?.searchParams.get("or")).toContain(
      "next_review_date.is.null",
    );
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

  it("scopes deck reads and review writes to the current user", async () => {
    let deckUrl: URL | undefined;
    let reviewUrl: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/flashcards`, ({ request }) => {
        deckUrl = new URL(request.url);
        return HttpResponse.json([]);
      }),
      http.patch(`${SUPABASE_URL}/rest/v1/flashcards`, ({ request }) => {
        reviewUrl = new URL(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await flashcardsApi.fetchByDeck("deck-1");
    await flashcardsApi.updateReview(
      "card-1",
      "2026-08-27T00:00:00.000Z",
      2,
      2.5,
    );

    expect(deckUrl?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(reviewUrl?.searchParams.get("user_id")).toBe("eq.user-1");
  });

  /* The bucket enforces both of these server-side, but the student should
     hear "that image is too big" before a five-megabyte upload starts, not
     after it is rejected. */
  describe("uploadImage guards", () => {
    it("refuses a file the bucket's mime allowlist would reject", async () => {
      const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
      await expect(flashcardsApi.uploadImage(file)).rejects.toThrow(
        "Card images must be a PNG, JPEG, WebP or GIF.",
      );
    });

    it("refuses a file over the bucket's 5 MB limit", async () => {
      const file = new File(["x"], "huge.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
      await expect(flashcardsApi.uploadImage(file)).rejects.toThrow(
        "That image is larger than 5 MB. Try a smaller one.",
      );
    });

    it("files the object under the owner's user id, which the bucket policy checks", async () => {
      let uploadPath: string | undefined;
      server.use(
        http.post(
          `${SUPABASE_URL}/storage/v1/object/card-media/:path*`,
          ({ request }) => {
            uploadPath = new URL(request.url).pathname;
            return HttpResponse.json({ Key: "card-media/user-1/x.png" });
          },
        ),
      );

      const path = await flashcardsApi.uploadImage(
        new File(["x"], "diagram.png", { type: "image/png" }),
      );

      expect(path.startsWith("user-1/")).toBe(true);
      expect(uploadPath).toContain("/card-media/user-1/");
    });
  });

  describe("updateReview ordering (offline sync)", () => {
    it("writes the review time and only lands over an older review", async () => {
      let url: URL | undefined;
      let body: Record<string, unknown> = {};
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/flashcards`, async ({ request }) => {
          url = new URL(request.url);
          body = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await flashcardsApi.updateReview(
        "card-1",
        "2026-10-02T00:00:00.000Z",
        3,
        2.5,
        { stability: 3.1, difficulty: 5 },
        "2026-09-29T08:00:00.000Z",
      );

      expect(body.last_reviewed_at).toBe("2026-09-29T08:00:00.000Z");
      expect(url?.searchParams.get("or")).toBe(
        "(last_reviewed_at.is.null,last_reviewed_at.lt.2026-09-29T08:00:00.000Z)",
      );
      expect(url?.searchParams.get("id")).toBe("eq.card-1");
      expect(url?.searchParams.get("user_id")).toBe("eq.user-1");
    });

    it("falls back to the old unconditional write until the column is deployed, and remembers", async () => {
      /* A fresh module, so the "column is missing" memory starts clean and
         doesn't leak into the other tests — with its own client to sign in. */
      vi.resetModules();
      const { flashcardsApi: fresh } = await import("./flashcards");
      const { mockAuthSession: signIn } = await import("../test/mockSession");
      signIn("user-1");
      const requests: Array<{ url: URL; body: Record<string, unknown> }> = [];
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/flashcards`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          requests.push({ url: new URL(request.url), body });
          if ("last_reviewed_at" in body) {
            return HttpResponse.json(
              { code: "PGRST204", message: "Could not find the 'last_reviewed_at' column of 'flashcards' in the schema cache" },
              { status: 400 },
            );
          }
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await fresh.updateReview("card-1", "2026-10-02T00:00:00.000Z", 3, 2.5);
      expect(requests).toHaveLength(2);
      expect(requests[1].body).not.toHaveProperty("last_reviewed_at");
      expect(requests[1].url.searchParams.get("or")).toBeNull();

      await fresh.updateReview("card-2", "2026-10-02T00:00:00.000Z", 3, 2.5);
      expect(requests).toHaveLength(3); // straight to the old write
    });

    it("still surfaces a real failure", async () => {
      server.use(
        http.patch(`${SUPABASE_URL}/rest/v1/flashcards`, () =>
          HttpResponse.json({ code: "42501", message: "permission denied" }, { status: 403 }),
        ),
      );
      await expect(
        flashcardsApi.updateReview("card-1", "2026-10-02T00:00:00.000Z", 3, 2.5),
      ).rejects.toThrow("permission denied");
    });
  });

  it("fetches cards due before a moment, nulls first, for the offline copy", async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/flashcards`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await flashcardsApi.fetchDueBefore("2026-10-01T12:00:00.000Z", 300);
    expect(url?.searchParams.get("or")).toBe(
      "(next_review_date.is.null,next_review_date.lte.2026-10-01T12:00:00.000Z)",
    );
    expect(url?.searchParams.get("order")).toBe("next_review_date.asc.nullsfirst");
    expect(url?.searchParams.get("limit")).toBe("300");
    expect(url?.searchParams.get("user_id")).toBe("eq.user-1");
  });
});
