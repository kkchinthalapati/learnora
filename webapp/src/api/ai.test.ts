import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import {
  callAI,
  createStudyPackage,
  generateWeeklyPlan,
  RETRY_DELAY_MS,
  type AIError,
} from "./ai";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("callAI", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the session's bearer token and returns the parsed text", async () => {
    let authHeader: string | null = null;
    server.use(
      http.post(EDGE_URL, ({ request }) => {
        authHeader = request.headers.get("Authorization");
        return HttpResponse.json({ text: "hello", modelUsed: "test" });
      }),
    );

    const text = await callAI({ history: [{ role: "user", content: "hi" }] });

    expect(text).toBe("hello");
    expect(authHeader).toBe("Bearer test-access-token");
  });

  it("falls back to the raw body when it isn't valid JSON, rather than throwing", async () => {
    server.use(
      http.post(EDGE_URL, () => new HttpResponse("not json at all", { status: 200 })),
    );

    expect(await callAI({ history: [] })).toBe("not json at all");
  });

  it("retries once on a 500, then succeeds", async () => {
    let attempts = 0;
    server.use(
      http.post(EDGE_URL, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json({ error: "temporary" }, { status: 500 });
        }
        return HttpResponse.json({ text: "ok", modelUsed: "test" });
      }),
    );

    const text = await callAI({ history: [] });

    expect(text).toBe("ok");
    expect(attempts).toBe(2);
  }, RETRY_DELAY_MS + 5000);

  it("retries on 429 the same way as a 500", async () => {
    let attempts = 0;
    server.use(
      http.post(EDGE_URL, () => {
        attempts++;
        if (attempts === 1) {
          return HttpResponse.json({ error: "rate limited" }, { status: 429 });
        }
        return HttpResponse.json({ text: "ok", modelUsed: "test" });
      }),
    );

    expect(await callAI({ history: [] })).toBe("ok");
    expect(attempts).toBe(2);
  }, RETRY_DELAY_MS + 5000);

  it("does not retry a 4xx that isn't 429 — the request itself is wrong", async () => {
    let attempts = 0;
    server.use(
      http.post(EDGE_URL, () => {
        attempts++;
        return HttpResponse.json({ error: "bad request" }, { status: 400 });
      }),
    );

    await expect(callAI({ history: [] })).rejects.toThrow("bad request");
    expect(attempts).toBe(1);
  });

  it("throws the edge function's own message on a persistent failure", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ error: "AI is temporarily unavailable." }, { status: 503 }),
      ),
    );

    await expect(callAI({ history: [] })).rejects.toThrow(
      "AI is temporarily unavailable.",
    );
  }, RETRY_DELAY_MS + 5000);

  it("marks a refused response so the caller can show it verbatim", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json(
          { error: "I can't help with that.", refused: true },
          { status: 422 },
        ),
      ),
    );

    const err = await callAI({ history: [] }).catch((e: AIError) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as AIError).message).toBe("I can't help with that.");
    expect((err as AIError).refused).toBe(true);
  });

  it("times out with a friendly message and does not retry", async () => {
    let attempts = 0;
    server.use(
      http.post(EDGE_URL, async () => {
        attempts++;
        // Never resolves within the test's short timeout budget below.
        await new Promise(() => {});
        return HttpResponse.json({ text: "too late" });
      }),
    );

    await expect(callAI({ history: [] }, { timeoutMs: 50 })).rejects.toThrow(
      "That took longer than expected and timed out. Please try again in a moment.",
    );
    // Given real time for a would-be retry to have fired, to prove it didn't.
    await new Promise((r) => setTimeout(r, 100));
    expect(attempts).toBe(1);
  });
});

describe("createStudyPackage", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(
      http.post(rest("materials"), async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(
          { id: "mat-1", created_at: "2026-01-01T00:00:00.000Z", ...body },
          { status: 201 },
        );
      }),
      http.post(rest("notes"), () => HttpResponse.json({ id: "note-1" }, { status: 201 })),
      http.post(rest("flashcard_decks"), async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "deck-1", ...body }, { status: 201 });
      }),
      http.post(rest("flashcards"), () =>
        HttpResponse.json([{ id: "card-1" }], { status: 201 }),
      ),
      http.post(rest("quizzes"), async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "quiz-1", ...body }, { status: 201 });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function serveEdge(byMode: Record<string, string>) {
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as { mode?: string };
        const mode = body.mode ?? "chat";
        const text = byMode[mode];
        if (text === undefined) {
          throw new Error(`Unexpected AI call for mode "${mode}"`);
        }
        return HttpResponse.json({ text, modelUsed: "test" });
      }),
    );
  }

  it("builds a deck and quiz from an existing material's saved notes", async () => {
    server.use(
      http.get(rest("notes"), () =>
        HttpResponse.json([
          { id: "note-1", material_id: "mat-1", markdown_content: "Existing notes about photosynthesis." },
        ]),
      ),
      http.get(rest("materials"), () =>
        HttpResponse.json({
          id: "mat-1",
          title: "Photosynthesis",
          folder_id: "folder-1",
          user_id: "user-1",
        }),
      ),
    );
    serveEdge({
      flashcards: JSON.stringify([{ front: "Q", back: "A" }]),
      quiz: JSON.stringify([
        { question: "Q", choices: ["a", "b"], correctIndex: 0 },
      ]),
    });

    const result = await createStudyPackage({
      source: { kind: "material", materialId: "mat-1" },
      outputs: { flashcards: true, quiz: true },
    });

    expect(result.material?.id).toBe("mat-1");
    expect(result.notes).toBeNull(); // not (re)generated — reused as-is
    expect(result.deck?.id).toBe("deck-1");
    expect(result.quiz?.id).toBe("quiz-1");
    expect(result.errors).toEqual([]);
  });

  it("throws when the material can't be found", async () => {
    server.use(http.get(rest("materials"), () => HttpResponse.json(null)));

    await expect(
      createStudyPackage({ source: { kind: "material", materialId: "gone" } }),
    ).rejects.toThrow("That material could not be found.");
  });

  it("throws when an existing material has no notes yet", async () => {
    server.use(
      http.get(rest("materials"), () =>
        HttpResponse.json({ id: "mat-1", title: "X", folder_id: null, user_id: "user-1" }),
      ),
      http.get(rest("notes"), () => HttpResponse.json([])),
    );

    await expect(
      createStudyPackage({ source: { kind: "material", materialId: "mat-1" } }),
    ).rejects.toThrow("No notes are available for this material yet");
  });

  it("creates a material from a link and generates notes", async () => {
    serveEdge({ notes: "# Study Guide\n\nPlenty of real detail goes here, well past the length floor." });

    const result = await createStudyPackage({
      source: { kind: "link", url: "https://example.com/article" },
      folderId: "folder-1",
    });

    expect(result.material?.type).toBe("text");
    expect(result.notes).toContain("Study Guide");
  });

  it("frames a YouTube link as a video topic instead of fencing it as document text", async () => {
    let capturedPrompt = "";
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as {
          history: { content: string }[];
        };
        capturedPrompt = body.history[0].content;
        return HttpResponse.json({
          text: "# Notes\n\nPlenty of real detail about the video's topic.",
        });
      }),
    );

    await createStudyPackage({
      source: { kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" },
      folderId: "folder-1",
    });

    expect(capturedPrompt).toContain("YouTube video link");
    expect(capturedPrompt).toContain("https://youtu.be/dQw4w9WgXcQ");
    expect(capturedPrompt).not.toContain('"""');
  });

  it("generates straight from a topic with no material created", async () => {
    serveEdge({
      quiz: JSON.stringify([
        { question: "Q", choices: ["a", "b"], correctIndex: 1 },
      ]),
    });

    const result = await createStudyPackage({
      source: { kind: "topic", topic: "Ionic bonding" },
      outputs: { quiz: true },
    });

    expect(result.material).toBeNull();
    expect(result.quiz?.id).toBe("quiz-1");
  });

  it("reports partial failure without throwing when one output fails to parse", async () => {
    serveEdge({
      notes: "# Notes\n\nEnough real detail to pass the length check.",
      flashcards: "not valid json",
      quiz: JSON.stringify([
        { question: "Q", choices: ["a", "b"], correctIndex: 0 },
      ]),
    });

    const result = await createStudyPackage({
      source: { kind: "text", text: "Source text long enough to pass validation checks." },
      folderId: "folder-1",
      outputs: { flashcards: true, quiz: true },
    });

    expect(result.notes).toBeTruthy();
    expect(result.deck).toBeNull();
    expect(result.quiz?.id).toBe("quiz-1");
    expect(result.errors).toEqual(["flashcards"]);
  });

  it("stops before generating outputs when notes generation itself fails", async () => {
    serveEdge({ notes: "" }); // too short — generateNotes returns null

    const result = await createStudyPackage({
      source: { kind: "text", text: "Source text long enough to pass validation checks." },
      folderId: "folder-1",
      outputs: { flashcards: true },
    });

    expect(result.errors).toEqual(["notes"]);
    expect(result.deck).toBeNull();
  });

  it("re-throws a content-safety refusal encountered while generating an output", async () => {
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as { mode?: string };
        if (body.mode === "notes") {
          return HttpResponse.json({
            text: "# Notes\n\nEnough real detail here to comfortably pass the length check.",
          });
        }
        return HttpResponse.json(
          { error: "I can't help with that topic.", refused: true },
          { status: 422 },
        );
      }),
    );

    await expect(
      createStudyPackage({
        source: { kind: "text", text: "Source text long enough to pass validation checks." },
        folderId: "folder-1",
        outputs: { flashcards: true },
      }),
    ).rejects.toMatchObject({ refused: true, message: "I can't help with that topic." });
  });

  it("reports progress through each stage it actually runs", async () => {
    serveEdge({ notes: "# Notes\n\nEnough real detail to pass the length check." });
    const messages: string[] = [];

    await createStudyPackage({
      source: { kind: "text", text: "Source text long enough to pass validation checks." },
      folderId: "folder-1",
      onProgress: (m) => messages.push(m),
    });

    expect(messages).toEqual(["Reading your material and writing notes…"]);
  });
});

describe("generateWeeklyPlan", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only feeds pending tasks and future non-completed exams into the prompt", async () => {
    server.use(
      http.get(rest("tasks"), () =>
        HttpResponse.json([
          { id: 1, text: "Pending task", is_done: false, due_date: null },
          { id: 2, text: "Done already", is_done: true, due_date: null },
        ]),
      ),
      http.get(rest("exams"), () =>
        HttpResponse.json([
          { id: 1, exam_name: "Future exam", exam_date: "2999-01-01", difficulty: "Hard", status: "Scheduled" },
          { id: 2, exam_name: "Past exam", exam_date: "2000-01-01", difficulty: "Easy", status: "Scheduled" },
          { id: 3, exam_name: "Completed exam", exam_date: "2999-01-01", difficulty: "Easy", status: "Completed" },
        ]),
      ),
    );
    let capturedPrompt = "";
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as { history: { content: string }[] };
        capturedPrompt = body.history[0].content;
        return HttpResponse.json({ text: JSON.stringify({ days: [] }) });
      }),
      http.post(rest("weekly_plans"), async ({ request }) => {
        const [row] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "plan-1", ...row }, { status: 201 });
      }),
    );

    await generateWeeklyPlan();

    expect(capturedPrompt).toContain("Pending task");
    expect(capturedPrompt).not.toContain("Done already");
    expect(capturedPrompt).toContain("Future exam");
    expect(capturedPrompt).not.toContain("Past exam");
    expect(capturedPrompt).not.toContain("Completed exam");
  });

  it("throws when the model's response has no usable plan JSON", async () => {
    server.use(
      http.get(rest("tasks"), () => HttpResponse.json([])),
      http.get(rest("exams"), () => HttpResponse.json([])),
      http.post(EDGE_URL, () => HttpResponse.json({ text: "not json at all" })),
    );

    await expect(generateWeeklyPlan()).rejects.toThrow(
      "Couldn't generate a plan this time. Please try again.",
    );
  });

  it("saves and returns the generated plan", async () => {
    server.use(
      http.get(rest("tasks"), () => HttpResponse.json([])),
      http.get(rest("exams"), () => HttpResponse.json([])),
      http.post(EDGE_URL, () =>
        HttpResponse.json({ text: JSON.stringify({ days: [{ date: "2026-01-01" }] }) }),
      ),
      http.post(rest("weekly_plans"), async ({ request }) => {
        const [row] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "plan-1", ...row }, { status: 201 });
      }),
    );

    const plan = await generateWeeklyPlan();

    expect(plan.id).toBe("plan-1");
    expect(plan.plan_json).toEqual({ days: [{ date: "2026-01-01" }] });
  });
});
