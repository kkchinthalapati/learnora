/* Stable identities for the mistake loop's idempotency (lib/mistakeLoop.ts).
 * Kept apart from mistakeLoop so lib/misconceptions can use them without an
 * import cycle through the FSRS module. */

/** FNV-1a, 32-bit, as hex. Not cryptographic: it only has to tell questions
 *  apart and be stable across devices. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A stable key for a question's wording: case, spacing and punctuation
 *  don't make a question new. */
export function questionKey(text: string): string {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return `q${fnv1a(norm)}${norm.length.toString(36)}`;
}

/** The idempotency key for one observation. A retried or replayed write
 *  produces the same key, and the database's unique index on
 *  (user_id, idempotency_key) drops the duplicate. */
export function observationKey(...parts: string[]): string {
  const raw = parts.join(":").replace(/[^A-Za-z0-9:_-]/g, "-");
  return raw.length <= 200 ? raw.padEnd(6, "-") : `${raw.slice(0, 180)}:${fnv1a(raw)}`;
}
