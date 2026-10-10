/* =========================================================================
   TOKEN USAGE — what one learnora-ai request spent across every model call
   it made (generation, the quiz check, a regeneration), written onto its
   ai_request_log row so cost per session can be worked out rather than
   guessed (research/efficiency-audit.md, E1).

   Providers that report nothing leave `reported` false, and the row stores
   null rather than a false 0.

   Plain JavaScript so the Deno function and the Node tests share one file.
   ========================================================================= */

/** @typedef {{ input: number, output: number, reported: boolean }} TokenUsage */

/** @returns {TokenUsage} */
export function newUsage() {
  return { input: 0, output: 0, reported: false };
}

/**
 * @param {TokenUsage | undefined} usage
 * @param {unknown} input
 * @param {unknown} output
 */
export function addUsage(usage, input, output) {
  if (!usage) return;
  const i = Number(input);
  const o = Number(output);
  if (Number.isFinite(i) && i > 0) {
    usage.input += i;
    usage.reported = true;
  }
  if (Number.isFinite(o) && o > 0) {
    usage.output += o;
    usage.reported = true;
  }
}

/**
 * An OpenAI-compatible or Anthropic response body's `usage`.
 * @param {TokenUsage | undefined} usage
 * @param {any} body
 */
export function addBodyUsage(usage, body) {
  const u = body?.usage;
  addUsage(usage, u?.prompt_tokens ?? u?.input_tokens, u?.completion_tokens ?? u?.output_tokens);
}

/**
 * Gemini's SDK reports usage on the response rather than in a JSON body.
 * @param {TokenUsage | undefined} usage
 * @param {any} result
 */
export function addGeminiUsage(usage, result) {
  const meta = result?.response?.usageMetadata;
  addUsage(usage, meta?.promptTokenCount, meta?.candidatesTokenCount);
}
