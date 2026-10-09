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

/** Share of words two labels have in common (Jaccard), 0-1. */
function overlap(a: string, b: string): number {
  const wa = new Set(words(normaliseTopicKey(a)));
  const wb = new Set(words(normaliseTopicKey(b)));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared);
}

/** The one candidate `label` belongs to, by index, or -1.
 *
 *  `topicMatches` answers "could these be the same topic", and every place
 *  that used it as "this evidence belongs here" let one label feed several
 *  topics at once: a quiz answer on "Cells" counted toward "Cell division",
 *  "Cell transport" and "Specialised cells" alike. Evidence has to land in
 *  one place, so this picks: an exact normalised match first; otherwise the
 *  `topicMatches` candidate sharing the most words. A tie is ambiguous and
 *  attributes nothing — unattributed evidence is honest, evidence counted
 *  three times is not. */
export function bestTopicMatch(label: string, candidates: readonly string[]): number {
  const key = normaliseTopicKey(label);
  if (!key) return -1;
  const exact = candidates.findIndex((c) => normaliseTopicKey(c) === key);
  if (exact !== -1) return exact;
  let best = -1;
  let bestScore = 0;
  let tied = false;
  candidates.forEach((c, i) => {
    if (!topicMatches(label, c)) return;
    const score = overlap(label, c);
    if (score > bestScore + 1e-9) {
      best = i;
      bestScore = score;
      tied = false;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      tied = true;
    }
  });
  return tied ? -1 : best;
}
