import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { AiError } from "./ai";
import {
  chatDiagramDeckTitle,
  generateImage,
  getChatImageUrl,
  saveImageAsFlashcard,
} from "./aiImage";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const STORAGE = `${SUPABASE_URL}/storage/v1/object`;
const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

beforeEach(() => {
  mockAuthSession("user-1");
});

describe("generateImage", () => {
  it("asks the edge function's image mode, billed as an image, and returns the storage key", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          text: "Diagram: a plant cell",
          alt: "Diagram: a plant cell",
          imagePath: "user-1/abc.png",
          modelUsed: "gemini/gemini-2.5-flash-image",
        });
      }),
    );

    const image = await generateImage("  a plant cell  ", DEFAULT_SETTINGS);

    expect(body?.mode).toBe("image");
    expect(body?.tool).toBe("image");
    expect(body?.history).toEqual([{ role: "user", content: "a plant cell" }]);
    expect(image).toEqual({
      path: "user-1/abc.png",
      alt: "Diagram: a plant cell",
      prompt: "a plant cell",
    });
  });

  it("surfaces a refusal as a refused AiError, so it reads as the answer", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ text: "I can't help with that topic.", refused: true }),
      ),
    );
    const error = await generateImage("something unsafe", DEFAULT_SETTINGS).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).refused).toBe(true);
    expect((error as AiError).message).toBe("I can't help with that topic.");
  });

  it("does not retry a failed generation — the server already tried every provider", async () => {
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return HttpResponse.json({ error: "down" }, { status: 503 });
      }),
    );
    await expect(generateImage("a heart", DEFAULT_SETTINGS)).rejects.toThrow(
      "AI is temporarily unavailable",
    );
    expect(calls).toBe(1);
  });

  it("refuses an empty description without spending a request", async () => {
    await expect(generateImage("   ", DEFAULT_SETTINGS)).rejects.toThrow(
      "Describe the picture you want first.",
    );
  });

  it("treats a reply with no picture as a failure", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "hmm" })));
    await expect(generateImage("a heart", DEFAULT_SETTINGS)).rejects.toThrow(
      "Couldn't draw that",
    );
  });
});

describe("getChatImageUrl", () => {
  it("signs the key in the private chat-media bucket, as an attachment when asked", async () => {
    server.use(
      http.post(`${STORAGE}/sign/chat-media/*`, () =>
        HttpResponse.json({ signedURL: "/object/sign/chat-media/user-1/abc.png?token=t" }),
      ),
    );
    expect(await getChatImageUrl("user-1/abc.png")).toMatch(
      /\/object\/sign\/chat-media\/user-1\/abc\.png\?token=t$/,
    );
    expect(
      await getChatImageUrl("user-1/abc.png", { download: "diagram.png" }),
    ).toMatch(/&download=diagram\.png$/);
  });
});

describe("saveImageAsFlashcard", () => {
  it("copies the picture into card-media and files one card in today's diagram deck", async () => {
    const uploads: string[] = [];
    const inserted: Record<string, unknown>[] = [];
    let deckCreated = false;
    server.use(
      http.get(`${STORAGE}/chat-media/*`, () =>
        new HttpResponse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { "Content-Type": "image/png" },
        }),
      ),
      http.post(`${STORAGE}/card-media/*`, ({ request }) => {
        uploads.push(new URL(request.url).pathname);
        return HttpResponse.json({ Key: "card-media/user-1/x.png" });
      }),
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([{ id: "deck-today", title: chatDiagramDeckTitle() }]),
      ),
      http.post(rest("flashcard_decks"), () => {
        deckCreated = true;
        return HttpResponse.json({ id: "deck-new" });
      }),
      http.post(rest("flashcards"), async ({ request }) => {
        const rows = (await request.json()) as Record<string, unknown>[];
        inserted.push(...rows);
        return HttpResponse.json({ id: "card-1", ...rows[0] });
      }),
    );

    const deckId = await saveImageAsFlashcard({
      path: "user-1/abc.png",
      alt: "Diagram: a plant cell",
      prompt: "a labelled plant cell",
    });

    expect(deckId).toBe("deck-today");
    expect(deckCreated).toBe(false);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/\/card-media\/user-1\/.+\.png$/);
    expect(inserted[0]).toMatchObject({
      deck_id: "deck-today",
      back: "a labelled plant cell",
    });
    expect(inserted[0].front_image_path).toMatch(/^user-1\/.+\.png$/);
  });
});
