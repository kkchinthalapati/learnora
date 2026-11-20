import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { decksApi } from "./decks";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const DECK = {
  id: "d-1",
  user_id: "user-1",
  folder_id: null,
  title: "Osmosis Flashcards",
  created_at: "2026-11-08T00:00:00.000Z",
};

describe("decksApi.add (audit F-16)", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("records the lesson the set was made from", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(rest("flashcard_decks"), async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...DECK, material_id: "mat-1" }, { status: 201 });
      }),
    );
    await decksApi.add(null, "Osmosis Flashcards", null, "mat-1");
    expect(bodies).toEqual([
      [{ user_id: "user-1", folder_id: null, title: "Osmosis Flashcards", material_id: "mat-1" }],
    ]);
  });

  /* Before migration 20261108000000 is applied the column is missing; the
     cards matter more than the link, so the deck is still made. */
  it("still makes the set when the lesson column does not exist yet", async () => {
    const bodies: Array<Array<Record<string, unknown>>> = [];
    server.use(
      http.post(rest("flashcard_decks"), async ({ request }) => {
        const body = (await request.json()) as Array<Record<string, unknown>>;
        bodies.push(body);
        if ("material_id" in body[0]) {
          return HttpResponse.json(
            { code: "PGRST204", message: "Could not find the 'material_id' column of 'flashcard_decks' in the schema cache" },
            { status: 400 },
          );
        }
        return HttpResponse.json(DECK, { status: 201 });
      }),
    );
    const deck = await decksApi.add(null, "Osmosis Flashcards", null, "mat-1");
    expect(deck.id).toBe("d-1");
    expect(bodies).toHaveLength(2);
    expect(bodies[1][0]).not.toHaveProperty("material_id");
  });
});

describe("decksApi.importCards", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  const cards = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ front: `q${i}`, back: `a${i}` }));

  it("inserts a large import in ordered chunks and reports progress", async () => {
    const sizes: number[] = [];
    server.use(
      http.post(rest("flashcard_decks"), () => HttpResponse.json(DECK, { status: 201 })),
      http.post(rest("flashcards"), async ({ request }) => {
        sizes.push(((await request.json()) as unknown[]).length);
        return HttpResponse.json([], { status: 201 });
      }),
    );
    const progress: number[] = [];
    const result = await decksApi.importCards(
      { folderId: null, title: "Big" },
      cards(1200),
      (n) => progress.push(n),
    );
    expect(sizes).toEqual([500, 500, 200]);
    expect(progress).toEqual([500, 1000, 1200]);
    expect(result).toEqual({ deck: DECK, added: 1200 });
  });

  it("deletes the new set when a chunk fails", async () => {
    let calls = 0;
    let deleted = false;
    server.use(
      http.post(rest("flashcard_decks"), () => HttpResponse.json(DECK, { status: 201 })),
      http.post(rest("flashcards"), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json([], { status: 201 })
          : HttpResponse.json({ message: "timeout" }, { status: 500 });
      }),
      http.delete(rest("flashcard_decks"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(
      decksApi.importCards({ folderId: null, title: "Big" }, cards(700)),
    ).rejects.toMatchObject({ name: "CardImportError", added: 0 });
    expect(deleted).toBe(true);
  });

  it("keeps an existing set and says how many cards went in", async () => {
    let calls = 0;
    server.use(
      http.post(rest("flashcards"), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json([], { status: 201 })
          : HttpResponse.json({ message: "timeout" }, { status: 500 });
      }),
    );
    await expect(
      decksApi.importCards({ deckId: "d-1" }, cards(700)),
    ).rejects.toMatchObject({ added: 500 });
  });
});
