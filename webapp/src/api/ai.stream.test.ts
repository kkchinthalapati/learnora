import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { AiError, callEdgeStream } from "./ai";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/** An SSE response whose events arrive as separate chunks, as on the wire. */
function sse(...events: object[]) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

const payload = { history: [{ role: "user" as const, content: "hi" }], tool: "chat" as const };

describe("callEdgeStream", () => {
  beforeEach(() => mockAuthSession("user-1"));

  it("sends stream:true and hands each piece over as it arrives", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return sse({ delta: "Hel" }, { delta: "lo" }, { done: true, modelUsed: "groq/x" });
      }),
    );
    const pieces: string[] = [];
    const result = await callEdgeStream(payload, { onDelta: (p) => pieces.push(p) });

    expect(sent?.stream).toBe(true);
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(result).toEqual({ text: "Hello" });
  });

  it("keeps events apart when a CRLF is split between chunks", async () => {
    server.use(
      http.post(EDGE_URL, () => {
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          start(c) {
            // The blank line ending the first event is split across chunks.
            c.enqueue(enc.encode('data: {"delta":"Hi"}\r\n\r'));
            c.enqueue(enc.encode('\ndata: {"done":true}\r\n\r\n'));
            c.close();
          },
        });
        return new HttpResponse(stream, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );
    const pieces: string[] = [];
    const result = await callEdgeStream(payload, { onDelta: (p) => pieces.push(p) });
    expect(pieces).toEqual(["Hi"]);
    expect(result.text).toBe("Hi");
  });

  it("clears shown text on reset and keeps only what follows", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        sse({ delta: "wrong start" }, { reset: true }, { delta: "right" }, { done: true }),
      ),
    );
    const resets: number[] = [];
    const result = await callEdgeStream(payload, { onReset: () => resets.push(1) });
    expect(resets).toEqual([1]);
    expect(result.text).toBe("right");
  });

  it("replaces the shown text with a refusal and reports it as refused", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        sse({ delta: "some unsafe text" }, { replace: "I can't help with that.", refused: true }, { done: true, refused: true }),
      ),
    );
    let replaced = "";
    const result = await callEdgeStream(payload, { onReplace: (t) => (replaced = t) });
    expect(replaced).toBe("I can't help with that.");
    expect(result).toEqual({ text: "I can't help with that.", refused: true });
  });

  it("takes a whole reply in one piece when the server did not stream it", async () => {
    server.use(http.post(EDGE_URL, () => HttpResponse.json({ text: "Cached answer." })));
    const pieces: string[] = [];
    const result = await callEdgeStream(payload, { onDelta: (p) => pieces.push(p) });
    expect(pieces).toEqual(["Cached answer."]);
    expect(result.text).toBe("Cached answer.");
  });

  it("surfaces a server error event as the failure message", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        sse({ error: "AI is temporarily unavailable. Please try again in a moment." }),
      ),
    );
    await expect(callEdgeStream(payload, {})).rejects.toMatchObject({
      message: "AI is temporarily unavailable. Please try again in a moment.",
    });
  });

  it("treats a stream that ends without its closing event as a dropped connection", async () => {
    server.use(http.post(EDGE_URL, () => sse({ delta: "partial" })));
    const error = await callEdgeStream(payload, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).message).toMatch(/connection dropped/i);
  });

  it("keeps a rate limit as a non-retryable error with the server's words", async () => {
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json({ text: "You have used today's allowance." }, { status: 429 }),
      ),
    );
    const error = await callEdgeStream(payload, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ status: 429, retryable: false });
    expect((error as AiError).message).toBe("You have used today's allowance.");
  });
});
