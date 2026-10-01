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

/* Words, lightly singularised, so "Cells" and "cell" agree. */
function words(key: string): string[] {
  return key
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** True when every word of the shorter key appears as a whole word in the
 *  longer one. Empty never matches.
 *
 *  This used to be raw substring containment, so a quiz weak topic "pH"
 *  matched a deck titled "Photosynthesis" ("ph" is inside "photo…") and
 *  pulled its forecast down, and "art" matched "Heart". Whole words keep the
 *  loose matching this exists for ("Enzymes" ~ "Enzymes and rates") without
 *  those collisions. */
export function topicMatches(a: string, b: string): boolean {
  const wa = words(normaliseTopicKey(a));
  const wb = words(normaliseTopicKey(b));
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const longSet = new Set(long);
  return short.every((w) => longSet.has(w));
}
