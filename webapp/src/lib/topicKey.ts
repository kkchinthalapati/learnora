/* Topic identity across the app.
 *
 * A topic is a deck title in the trajectory model, a free-text task on the
 * timer, a concept in Feynman, a subject in Viva. None of those agree on
 * capitalisation or punctuation, and they never will, so evidence is keyed by
 * a normalised form and matched loosely — the same `includes` rule
 * `buildTopicStates` already uses for quiz weak-topics. */

export function normaliseTopicKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when either normalised key contains the other. Empty never matches. */
export function topicMatches(a: string, b: string): boolean {
  const ka = normaliseTopicKey(a);
  const kb = normaliseTopicKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}
