/* =========================================================================
   STREAMING — the wire format between learnora-ai and the browser, and the
   readers for the provider streams it forwards.

   The function answers a streamed request with Server-Sent Events. Each
   event's data is one JSON object:
     { delta: "text" }          more of the reply
     { reset: true }            drop what was shown; a provider failed after
                                it had started and the chain has moved on
     { replace: "text" }        show this instead (a refusal found after the
                                text was already on screen)
     { done: true, modelUsed }  the reply is complete
     { error: "message" }       nothing usable came back

   Plain JavaScript with no Deno APIs, so the Deno function and the Deno
   tests share one file (`npx deno test`). The browser keeps its own small
   reader in webapp/src/api/ai.ts — keep the two in step.
   ========================================================================= */

/** @param {object} event @returns {string} one SSE frame */
export function encodeEvent(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * The data payload of one SSE block, or null when it carries none. Multiple
 * `data:` lines join with newlines, as the spec says.
 * @param {string} block
 * @returns {string | null}
 */
export function dataOf(block) {
  const lines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * Reads an SSE body, calling `onData` with each event's data payload.
 * Tolerates events split across chunks and CRLF line endings.
 * @param {ReadableStream<Uint8Array>} body
 * @param {(payload: string) => void} onData
 */
export async function readSse(body, onData) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const drain = () => {
    let at;
    while ((at = buffer.indexOf("\n\n")) !== -1) {
      const payload = dataOf(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
      if (payload !== null) onData(payload);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    drain();
  }
  buffer += decoder.decode().replace(/\r\n/g, "\n");
  drain();
  if (buffer.trim()) {
    const payload = dataOf(buffer);
    if (payload !== null) onData(payload);
  }
}

/** Text in an OpenAI-style chat-completion chunk. @param {any} json */
export function openAiDelta(json) {
  const piece = json?.choices?.[0]?.delta?.content;
  return typeof piece === "string" ? piece : "";
}

/** Text in an Anthropic stream event. @param {any} json */
export function anthropicDelta(json) {
  if (json?.type !== "content_block_delta") return "";
  const piece = json.delta?.type === "text_delta" ? json.delta.text : "";
  return typeof piece === "string" ? piece : "";
}
