/* What a plan block should actually open.
 *
 * A generated block is prose — `{ subject, durationMins, reason }` — and the
 * evidence that produced it (the weak deck, the failing cards) is gone by the
 * time it reaches the grid. So "Start →" could only ever stage a blank timer
 * and leave the student to go and find the right deck themselves: the app knew
 * the answer and still handed over the work.
 *
 * This resolves a block back to a real thing to open, against the content the
 * Plan view already has in cache. Deliberately deterministic and done here
 * rather than asked of the model: a model asked to emit deck ids invents them,
 * and a confidently-wrong deep link is worse than no link at all.
 *
 * Matching is strict for the same reason `prioritiseByMisconceptions` is (see
 * views/review/srs.ts): a missed match costs nothing — the block behaves exactly
 * as it does today — while a false one sends a student into the wrong deck.
 */

import type { PlanBlock } from "../../lib/aiJson";
import { wasAlreadyHard } from "../../lib/misconceptions";

export interface PlanTarget {
  kind: "deck" | "quiz";
  id: string;
  title: string;
  /** Cards due in this deck right now. Absent on a quiz target. */
  dueCount?: number;
}

export interface PlanTargetSources {
  folders: Array<{ id: string; name: string }>;
  decks: Array<{ id: string; title: string; folder_id: string | null }>;
  quizzes: Array<{
    id: string;
    title: string;
    folder_id: string | null;
    created_at?: string;
  }>;
  /** Cards due now, across every deck. The memory fields rank decks by how
   *  much trouble the student is actually in, not merely by volume. */
  dueCards: Array<{
    deck_id: string | null;
    difficulty?: number | null;
    ease_factor?: number | null;
  }>;
}

export interface ResolvedBlockTarget {
  /** The subject's folder, when one matched. Passed to the timer so a
   *  plan-driven session is finally credited to the subject it was planned
   *  for — it was being logged against no folder at all. */
  folderId?: string;
  target?: PlanTarget;
}

function normalise(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Decks in the folder that have cards due, best first.
 *
 *  A deck with two cards the student keeps failing is a better use of the next
 *  45 minutes than one with twelve they find easy, so hard cards outrank
 *  volume. Title breaks the remaining ties so the same plan always resolves to
 *  the same deck rather than drifting with query order. */
function bestDeck(
  sources: PlanTargetSources,
  folderId: string,
): PlanTarget | undefined {
  const inFolder = sources.decks.filter((d) => d.folder_id === folderId);
  if (inFolder.length === 0) return undefined;

  const ranked = inFolder
    .map((deck) => {
      const due = sources.dueCards.filter((c) => c.deck_id === deck.id);
      return {
        deck,
        dueCount: due.length,
        hardCount: due.filter((c) => wasAlreadyHard(c)).length,
      };
    })
    .filter((entry) => entry.dueCount > 0)
    .sort(
      (a, b) =>
        b.hardCount - a.hardCount ||
        b.dueCount - a.dueCount ||
        a.deck.title.localeCompare(b.deck.title),
    );

  const top = ranked[0];
  if (!top) return undefined;
  return {
    kind: "deck",
    id: top.deck.id,
    title: top.deck.title,
    dueCount: top.dueCount,
  };
}

/** The folder's most recent quiz — the fallback when nothing is due.
 *
 *  Weaker evidence than a due card (a quiz has no notion of being owed), so it
 *  is only ever reached once the scheduler has nothing to say. The button names
 *  the quiz it will open, so a student who has just taken it can see that and
 *  choose otherwise. */
function latestQuiz(
  sources: PlanTargetSources,
  folderId: string,
): PlanTarget | undefined {
  const inFolder = sources.quizzes
    .filter((q) => q.folder_id === folderId)
    .sort(
      (a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
        a.title.localeCompare(b.title),
    );

  const top = inFolder[0];
  if (!top) return undefined;
  return { kind: "quiz", id: top.id, title: top.title };
}

/**
 * Resolve one block to the folder it belongs to and the best thing to open.
 *
 * Returns an empty object when the subject names no folder we hold — the block
 * then behaves exactly as it always has.
 */
export function resolveBlockTarget(
  block: Pick<PlanBlock, "subject">,
  sources: PlanTargetSources,
): ResolvedBlockTarget {
  const subject = normalise(block.subject ?? "");
  if (!subject) return {};

  const folder = sources.folders.find((f) => normalise(f.name) === subject);
  if (!folder) return {};

  return {
    folderId: folder.id,
    target: bestDeck(sources, folder.id) ?? latestQuiz(sources, folder.id),
  };
}
