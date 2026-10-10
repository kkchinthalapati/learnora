/* =========================================================================
   ITEM CACHE — AI text tied to one practice-bank question, generated once.

   A hint ladder or a wrong-answer explanation for a bank question is the
   same for every student at the same level, but each device paid for its
   own (research/efficiency-audit.md, E4). The client marks such a request
   `itemCache: { ref: "bank:<uuid>" }`; the server answers repeats from
   public.ai_item_cache.

   The key is a SHA-256 of the whole request as the model would see it —
   mode, tool, context and every turn — computed here, never supplied by the
   client. A cached answer is therefore only ever served for exactly the
   request that produced it: a student cannot plant text under a bank
   question by sending a different prompt with its ref. Only bank refs are
   accepted, and only text that passed the same safety screen as any reply
   is stored.

   Plain JavaScript so the Deno function and the Node tests share one file.
   ========================================================================= */

const BANK_REF = /^bank:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The bank ref a request asks to be cached under, or null.
 * @param {unknown} raw  The request body's `itemCache` field.
 * @returns {string | null}
 */
export function cacheableRef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ref = /** @type {{ ref?: unknown }} */ (raw).ref;
  return typeof ref === "string" && BANK_REF.test(ref) ? ref : null;
}

/**
 * SHA-256 (hex) of the request's model-facing content.
 * @param {{ mode?: unknown, tool?: unknown, context?: unknown, history?: unknown }} req
 * @returns {Promise<string>}
 */
export async function requestHash(req) {
  const material = JSON.stringify({
    v: 1,
    mode: req.mode ?? null,
    tool: req.tool ?? null,
    context: req.context ?? null,
    history: Array.isArray(req.history)
      ? req.history.map((m) => [m?.role ?? null, m?.content ?? null])
      : null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
