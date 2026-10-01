/* True for the daily allowance / burst limit (HTTP 429) and for a content
 * refusal: the server has ruled, and substituting template content would
 * hide that from the student ("the AI isn't available" when they had simply
 * used today's allowance).
 *
 * Duck-typed on AiError's `status` / `refused` rather than `instanceof`, and
 * kept out of ai.ts, so modules whose tests mock "./ai" can still import it. */
export function isLimitOrRefusal(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: unknown; refused?: unknown };
  return e.status === 429 || e.refused === true;
}
