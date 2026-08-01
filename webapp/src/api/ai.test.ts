import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { AiError, callEdge, trimHistory, MAX_HISTORY } from "./ai";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/* RETRY_DELAY_MS is 2s of real waiting, and fake timers are unusable here
 * (MSW paces itself off Date.now() — see REACT_MIGRATION.md's Step 9 note), so
 * the retry tests stub the delay away by asserting on request counts with a
 * one-attempt budget instead of letting the default retry run. */

describe("callEdge", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the payload with the session's bearer token", async () => {
    let authorization: string | null = null;
    let body: unknown;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        authorization = request.headers.get("Authorization");
        body = await request.json();
        return HttpResponse.json({ text: "hello" });
      }),
    );

    const result = await callEdge({
      history: [{ role: "user", content: "hi" }],
      mode: "plan",
    });

    expect(result.text).toBe("hello");
    expect(authorization).toBe("Bearer test-access-token");
    expect(body).toMatchObject({
      mode: "plan",
      history: [{ role: "user", content: "hi" }],
    });
  });

  it("sends no Authorization header when there is no session", async () => {
    mockNoAuthSession();
    let authorization: string | null = "unset";
    server.use(
      http.post(EDGE_URL, ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json({ text: "ok" });
      }),
    );

    await callEdge({ history: [] });
    expect(authorization).toBeNull();
  });

  it("unwraps {text} but passes a plain-text body through untouched", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.text("raw markdown")));
    await expect(callEdge({ history: [] })).resolves.toEqual({
      text: "raw markdown",
    });
  });

  it("calls onText once with the full reply", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "done" })));
    const onText = vi.fn();

    await callEdge({ history: [] }, onText);

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("done");
  });

  it("awaits an async onText before resolving", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "done" })));
    const order: string[] = [];

    await callEdge({ history: [] }, async () => {
      await Promise.resolve();
      order.push("onText");
    });
    order.push("resolved");

    expect(order).toEqual(["onText", "resolved"]);
  });

  it("surfaces the server's own error message", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ error: "All providers are down" }, { status: 503 }),
      ),
    );

    await expect(callEdge({ history: [] }, undefined, 0)).rejects.toThrow(
      "All providers are down",
    );
  });

  /* A 4xx means the request itself is wrong (expired token, bad payload).
     Replaying it burns another round trip and 2s of spinner to fail
     identically, so it must not be retried. */
  it("does not retry a 4xx", async () => {
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return HttpResponse.json({ error: "Bad token" }, { status: 401 });
      }),
    );

    await expect(callEdge({ history: [] })).rejects.toMatchObject({
      message: "Bad token",
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("marks 429 and 5xx retryable", async () => {
    for (const status of [429, 500, 503]) {
      server.use(http.post(EDGE_URL, () => HttpResponse.json({}, { status })));
      await expect(
        callEdge({ history: [] }, undefined, 0),
      ).rejects.toMatchObject({ retryable: true });
    }
  });

  it("retries a retryable failure and returns the successful attempt", async () => {
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({}, { status: 503 })
          : HttpResponse.json({ text: "second time lucky" });
      }),
    );

    /* Retry budget of 1 with the real 2s backoff — well inside the suite's
       20s testTimeout, and the only honest way to prove the delay path. */
    await expect(callEdge({ history: [] })).resolves.toEqual({
      text: "second time lucky",
    });
    expect(calls).toBe(2);
  }, 15000);

  it("flags a content refusal so it can be shown verbatim", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json(
          { error: "I can't help with that topic.", refused: true },
          { status: 400 },
        ),
      ),
    );

    await expect(callEdge({ history: [] })).rejects.toMatchObject({
      refused: true,
      retryable: false,
      message: "I can't help with that topic.",
    });
  });

  /* Only quiz/flashcards/plan are JSON modes, so a safety refusal for chat or
     notes comes back as a 200 with the refusal sentence as `text` rather than
     a thrown error — see supabase/functions/learnora-ai's
     `safetyRefusalResponse`. Callers that read `text` as data instead of
     displaying it (generateNotes) need this flag to tell the two apart. */
  it("surfaces a 200 refusal's flag alongside its text", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({
          text: "I can't help with that topic.",
          refused: true,
          modelUsed: "safety-filter",
        }),
      ),
    );

    await expect(callEdge({ history: [] })).resolves.toEqual({
      text: "I can't help with that topic.",
      refused: true,
    });
  });

  it("falls back to a generic message when the error body has none", async () => {
    server.use(
      http.post(EDGE_URL, () => HttpResponse.json({}, { status: 500 })),
    );

    await expect(callEdge({ history: [] }, undefined, 0)).rejects.toThrow(
      "AI is temporarily unavailable",
    );
  });

  /* Our own deadline firing means the server already spent its full budget
     walking the provider chain, so a replay costs another minute to almost
     certainly time out again. */
  it("does not retry its own timeout, and says so in the message", async () => {
    let calls = 0;
    server.use(
      http.post(EDGE_URL, () => {
        calls++;
        return HttpResponse.error();
      }),
    );
    const timeout = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(timeout);

    await expect(callEdge({ history: [] })).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining("timed out"),
    });
    expect(calls).toBe(0);
  });

  it("is an AiError, so callers can branch on refused/retryable", async () => {
    server.use(
      http.post(EDGE_URL, () => HttpResponse.json({}, { status: 500 })),
    );
    await expect(
      callEdge({ history: [] }, undefined, 0),
    ).rejects.toBeInstanceOf(AiError);
  });
});

describe("trimHistory", () => {
  it("keeps a short conversation intact", () => {
    const history = [{ role: "user" as const, content: "hi" }];
    expect(trimHistory(history)).toBe(history);
  });

  it("keeps only the most recent MAX_HISTORY messages", () => {
    const history = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => ({
      role: "user" as const,
      content: String(i),
    }));

    const trimmed = trimHistory(history);

    expect(trimmed).toHaveLength(MAX_HISTORY);
    expect(trimmed[0].content).toBe("5");
    expect(trimmed.at(-1)?.content).toBe(String(MAX_HISTORY + 4));
  });
});
