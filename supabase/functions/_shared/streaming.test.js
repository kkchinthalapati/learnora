// Run with: npx deno test supabase/functions/_shared/streaming.test.js
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anthropicDelta, dataOf, encodeEvent, openAiDelta, readSse } from "./streaming.js";

const bodyOf = (...chunks) =>
  new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });

Deno.test("encodeEvent writes one SSE frame whose data parses back to the event", () => {
  const frame = encodeEvent({ delta: "a\nb" });
  assertEquals(frame.startsWith("data: "), true);
  assertEquals(frame.endsWith("\n\n"), true);
  assertEquals(JSON.parse(dataOf(frame)), { delta: "a\nb" });
});

Deno.test("dataOf joins multi-line data and ignores other fields", () => {
  assertEquals(dataOf("event: x\ndata: one\ndata: two"), "one\ntwo");
  assertEquals(dataOf(": comment"), null);
});

Deno.test("readSse reassembles an event split across chunks", async () => {
  const seen = [];
  await readSse(bodyOf('data: {"de', 'lta":"hi"}\n\ndata: {"done":true}\n\n'), (p) => seen.push(p));
  assertEquals(seen, ['{"delta":"hi"}', '{"done":true}']);
});

Deno.test("readSse accepts CRLF line endings and a final event without a blank line", async () => {
  const seen = [];
  await readSse(bodyOf('data: {"delta":"a"}\r\n\r\ndata: {"delta":"b"}'), (p) => seen.push(p));
  assertEquals(seen, ['{"delta":"a"}', '{"delta":"b"}']);
});

Deno.test("openAiDelta reads content and ignores usage-only chunks", () => {
  assertEquals(openAiDelta({ choices: [{ delta: { content: "Hi" } }] }), "Hi");
  assertEquals(openAiDelta({ choices: [], usage: { prompt_tokens: 3 } }), "");
  assertEquals(openAiDelta({ choices: [{ delta: { role: "assistant" } }] }), "");
});

Deno.test("anthropicDelta reads text deltas only", () => {
  assertEquals(anthropicDelta({ type: "content_block_delta", delta: { type: "text_delta", text: "Yo" } }), "Yo");
  assertEquals(anthropicDelta({ type: "message_start", message: {} }), "");
  assertEquals(anthropicDelta({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } }), "");
});
