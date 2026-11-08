/* The daily review reminder: what it says, and where it opens.
 *
 * It used to count flashcards and nothing else. The ledger's check-backs (a
 * mix-up that was re-taught and is now due a check on a new question,
 * misconceptions.retest_due_at) were invisible outside the app, so the one
 * moment Learnora is built around, "did the fix stick?", only happened if
 * the student opened the app by chance on the right day. On 2026-11-05 no
 * student had used the app on more than one day in the last two weeks.
 *
 * A due check-back leads, and the cards ride along, in the one reminder a
 * day the review toggle already allows (kind `flashcards_due`, so the dedupe
 * log and both students' toggles stay as they are). The concept is named; the
 * wrong belief is not, because a notification is read on a lock screen.
 *
 * Pure, shared by send-push-reminders and send-email-reminders, pinned by
 * tests/review-nudge.test.js. */

/** Due check-backs per user, oldest first. Mirrors retestsDue in
 *  webapp/src/lib/mistakeLoop.ts: not resolved, re-taught, and due.
 * @param {{ id: string, user_id: string, concept: string | null, status: string, repaired_at: string | null, retest_due_at: string | null }[]} rows
 * @param {Date} now
 * @returns {Map<string, { id: string, concept: string }[]>}
 */
export function dueCheckBacksByUser(rows, now) {
  const byUser = new Map();
  const due = (rows ?? [])
    .filter(
      (r) =>
        r.status !== "resolved" &&
        r.repaired_at &&
        r.retest_due_at &&
        new Date(r.retest_due_at).getTime() <= now.getTime(),
    )
    .sort((a, b) => new Date(a.retest_due_at).getTime() - new Date(b.retest_due_at).getTime());
  for (const r of due) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({ id: r.id, concept: cleanConcept(r.concept) });
    byUser.set(r.user_id, list);
  }
  return byUser;
}

const MAX_CONCEPT_CHARS = 60;

function cleanConcept(concept) {
  const text = String(concept ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "an idea you fixed";
  return text.length > MAX_CONCEPT_CHARS ? `${text.slice(0, MAX_CONCEPT_CHARS - 1).trimEnd()}…` : text;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The reminder for one student, or null when nothing is due.
 * @param {{ cardsDue: number, checkBacks: { id: string, concept: string }[] }} due
 * @returns {{ title: string, body: string, path: string } | null}
 *   `path` is under the app's base, e.g. "/app/check-back/<id>".
 */
export function reviewNudge({ cardsDue, checkBacks }) {
  const cards = Math.max(0, cardsDue | 0);
  const first = checkBacks?.[0];
  if (first) {
    const moreChecks = checkBacks.length - 1;
    const extras = [
      moreChecks > 0 ? plural(moreChecks, "more check is", "more checks are") + " waiting" : "",
      cards > 0 ? plural(cards, "card is", "cards are") + " due" : "",
    ].filter(Boolean);
    return {
      title: `Did your fix on ${first.concept} stick?`,
      body: `One new question will tell you.${extras.length ? ` ${capitalise(extras.join(", and "))}.` : ""}`,
      path: `/app/check-back/${encodeURIComponent(first.id)}`,
    };
  }
  if (cards > 0) {
    return {
      title: `${plural(cards, "flashcard", "flashcards")} due`,
      body: "Time for a quick review round.",
      path: "/app/review",
    };
  }
  return null;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** For the email body: the student's concept text is data, not markup. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
