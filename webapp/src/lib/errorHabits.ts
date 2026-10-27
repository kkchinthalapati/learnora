/* Error habits — the same kind of mistake across subjects. Pure logic.
 *
 * The ledger files every wrong belief under its own subject, so a student who
 * stretches a rule too far in Physics, Biology and Chemistry sees three
 * unrelated mistakes. They are one habit. A tutor who has watched a student
 * for a term says exactly this ("you keep assuming it always works"), and it
 * is the reason fixing one mistake can fix others: the fix is the habit, not
 * the fact.
 *
 * The label comes from the misconception catalogue, which already files each
 * named belief under a reasoning category. No model is asked: a category is
 * authored, so the claim "these are the same kind of mistake" can be checked
 * by reading the two entries, and it is never a guess about the student.
 *
 * What the app may say, and no more:
 * - "spreading": open mistakes of this kind in two or more subjects.
 * - "carry-over": one open, and the same kind already fixed in another
 *   subject. The positive reading of the same fact.
 * Neither says the student "always" does anything. A habit is a label for a
 * kind of mistake, not a diagnosis of a person. */

import {
  detectFromDiagnosis,
  getKnownMisconception,
  type KnownMisconception,
  type MisconceptionCategory,
} from "./misconceptionCatalogue";
import type { Misconception } from "./misconceptions";

/** "Term conflation" is left out on purpose. It is the catalogue's loosest
 *  bucket (it holds "enzymes are killed" and "energy is recycled", which are
 *  not term swaps), so a habit named for it would be wrong more often than
 *  not. Real term swaps are the pairs' job (lib/confusionPairs.ts), and those
 *  are tied to their entries by hand. */
export type HabitCategory = Exclude<MisconceptionCategory, "Term conflation">;

export interface Habit {
  category: HabitCategory;
  /** URL segment. */
  slug: string;
  /** What the student sees, sentence case. */
  name: string;
  /** What the mistake looks like, in one sentence. */
  looksLike: string;
  /** The move that catches it, in one or two sentences. */
  move: string;
  /** The question to put to yourself before answering. */
  question: string;
}

/* Each name is written to fit every catalogue entry filed under its category,
   not only the clearest one: "Reversed process" holds a wrong lens and a wrong
   electrode as well as a process run backwards, so it is "back to front". */
export const HABITS: Record<HabitCategory, Habit> = {
  Overgeneralisation: {
    category: "Overgeneralisation",
    slug: "overgeneralisation",
    name: "Stretching a rule too far",
    looksLike: "Taking something true in one case and treating it as true in every case.",
    move: "Before you commit, look for the case where the rule stops working. Most rules have an edge.",
    question: "When would this not be true?",
  },
  "Reversed process": {
    category: "Reversed process",
    slug: "reversed-process",
    name: "Getting it back to front",
    looksLike: "Having the right pieces but the wrong way round: which direction, which way, or which one does what.",
    move: "Write it as arrows from start to end, or label each side, and check every arrow against the question before you answer.",
    question: "Which way round does this go?",
  },
  "Causation reversal": {
    category: "Causation reversal",
    slug: "causation-reversal",
    name: "Getting the cause wrong",
    looksLike: "Treating the result as the reason, or finding a cause where nothing links the two.",
    move: "Say it as “A causes B”, then test it the other way round, and ask whether anything really links them.",
    question: "What actually makes this happen?",
  },
  "Confused inputs and outputs": {
    category: "Confused inputs and outputs",
    slug: "inputs-outputs",
    name: "Mixing up what goes in and what comes out",
    looksLike: "Swapping what a process uses or moves with what it makes or carries.",
    move: "List what goes in on the left and what comes out on the right before you start, then check each against the question.",
    question: "What goes in, and what comes out?",
  },
  "Scale and quantity": {
    category: "Scale and quantity",
    slug: "scale-quantity",
    name: "Misjudging how a quantity behaves",
    looksLike: "Getting wrong how something scales, what range it can take, or what it depends on.",
    move: "Ask what the quantity depends on and what values it can take, then check that your answer has a sensible size.",
    question: "What does this depend on, and is that size sensible?",
  },
  Mechanism: {
    category: "Mechanism",
    slug: "mechanism",
    name: "A wrong picture of what’s happening",
    looksLike: "A mental picture of what is physically going on that doesn’t match what really does.",
    move: "Describe what each particle, cell or force is actually doing, step by step, instead of jumping to the outcome.",
    question: "What is each part actually doing?",
  },
  Procedure: {
    category: "Procedure",
    slug: "procedure",
    name: "Using a method that doesn’t fit",
    looksLike: "Following steps that look right but aren’t the right steps for this question.",
    move: "Say what each step is for. If you can’t say why a step is there, it may not be the right step.",
    question: "What is each step for?",
  },
};

export function habitBySlug(slug: string): Habit | null {
  return Object.values(HABITS).find((h) => h.slug === slug) ?? null;
}

/** /analytics/habits/:slug: under /analytics, which owns its page title. */
export function habitHref(habit: Habit): string {
  return `/analytics/habits/${habit.slug}`;
}

export interface HabitRow {
  row: Misconception;
  entry: KnownMisconception;
  /** The catalogue's canonical subject, so "Maths" and "Mathematics" agree. */
  subject: string;
}

export type HabitKind = "spreading" | "carry-over";

export interface ActiveHabit {
  habit: Habit;
  kind: HabitKind;
  /** Open rows of this kind. */
  open: HabitRow[];
  /** Fixed rows of this kind, in any subject. */
  fixed: HabitRow[];
  /** Subjects with an open row. */
  openSubjects: string[];
  /** Subjects with a fixed row and no open one. */
  fixedSubjects: string[];
  /** Sightings across the open rows. */
  observed: number;
}

/** The catalogue entry behind a row, or null. Slips (misread, calculation,
 *  time) are not beliefs and have none; a provisional AI label seen once is a
 *  guess and is left out (lib/mistakeLoop.ts `isNamedPattern`). */
function entryFor(m: Misconception): KnownMisconception | null {
  if (m.errorType) return null;
  if (m.status !== "resolved" && m.provisional && m.timesObserved < 2) return null;
  const entry = m.catalogueId ? getKnownMisconception(m.catalogueId) : detectFromDiagnosis(m.concept, m.summary);
  return entry && entry.category !== "Term conflation" ? entry : null;
}

export function categoryOf(m: Misconception): HabitCategory | null {
  return entryFor(m)?.category as HabitCategory | undefined ?? null;
}

/**
 * The habits the ledger shows, strongest first: spreading before carry-over,
 * then by how many subjects, then by sightings.
 */
export function habitsForStudent(ledger: readonly Misconception[]): ActiveHabit[] {
  const byCategory = new Map<HabitCategory, { open: HabitRow[]; fixed: HabitRow[] }>();
  for (const row of ledger) {
    const entry = entryFor(row);
    if (!entry) continue;
    const category = entry.category as HabitCategory;
    const bucket = byCategory.get(category) ?? { open: [], fixed: [] };
    (row.status === "resolved" ? bucket.fixed : bucket.open).push({ row, entry, subject: entry.subject });
    byCategory.set(category, bucket);
  }

  const out: ActiveHabit[] = [];
  for (const [category, { open, fixed }] of byCategory) {
    const openSubjects = [...new Set(open.map((r) => r.subject))];
    const fixedSubjects = [...new Set(fixed.map((r) => r.subject))].filter((s) => !openSubjects.includes(s));
    const kind: HabitKind | null =
      openSubjects.length >= 2 ? "spreading" : openSubjects.length === 1 && fixedSubjects.length >= 1 ? "carry-over" : null;
    if (!kind) continue;
    out.push({
      habit: HABITS[category],
      kind,
      open,
      fixed,
      openSubjects,
      fixedSubjects,
      observed: open.reduce((n, r) => n + r.row.timesObserved, 0),
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.kind === "spreading") - Number(a.kind === "spreading") ||
      b.openSubjects.length - a.openSubjects.length ||
      b.observed - a.observed ||
      a.habit.slug.localeCompare(b.habit.slug),
  );
}

export function joinSubjects(subjects: readonly string[]): string {
  if (subjects.length <= 1) return subjects[0] ?? "";
  return `${subjects.slice(0, -1).join(", ")} and ${subjects[subjects.length - 1]}`;
}

/** One sentence for a row or a card that already shows the habit's name, so
 *  it carries only what is new: where, saying only what the ledger shows. */
export function habitSentence(h: ActiveHabit): string {
  return h.kind === "spreading"
    ? `Shows up in ${joinSubjects(h.openSubjects)}.`
    : `You fixed this in ${joinSubjects(h.fixedSubjects)}. Watch for it in ${joinSubjects(h.openSubjects)}.`;
}

/** The same fact as a clause for a prompt line, where the name leads. */
function habitWhere(h: ActiveHabit): string {
  return h.kind === "spreading"
    ? `open in ${joinSubjects(h.openSubjects)}`
    : `fixed in ${joinSubjects(h.fixedSubjects)}, still open in ${joinSubjects(h.openSubjects)}`;
}

/* ── Where the ledger's prompts learn about habits ───────────────────────── */

const MAX_HABITS_IN_PROMPT = 2;

/** For any AI prompt that already carries the ledger. App-authored text only:
 *  no student wording goes in, so nothing needs fencing. */
export function habitPromptBlock(ledger: readonly Misconception[]): string {
  const habits = habitsForStudent(ledger).slice(0, MAX_HABITS_IN_PROMPT);
  if (habits.length === 0) return "";
  return [
    "CROSS-SUBJECT HABITS (the same kind of mistake in more than one subject, from this student's own ledger):",
    ...habits.map(
      (h) => `  · ${h.habit.name} (${habitWhere(h)}). The move that helps: ${h.habit.move}`,
    ),
    "- USE RULE: when you explain or set a question in any of those subjects, work the habit's check in where it fits, in a few words.",
    "- HONESTY RULE: a habit is a label for a kind of mistake, not a verdict on the student. Never say they always do it, and never recite this list.",
  ].join("\n");
}

/** For quiz generation. */
export function habitQuizFocus(ledger: readonly Misconception[]): string {
  const habits = habitsForStudent(ledger).filter((h) => h.kind === "spreading").slice(0, MAX_HABITS_IN_PROMPT);
  if (habits.length === 0) return "";
  return `HABITS this student's mistakes share across subjects:
${habits.map((h) => `- ${h.habit.name} (${h.habit.looksLike})`).join("\n")}
- Where it is natural for the material above, build a question whose most tempting WRONG option comes from one of these habits. Do not name the habit anywhere in the question or feedback. If none fits, ignore them.`;
}

/* ── Finding a habit from a subject ──────────────────────────────────────── */

/** Does a student's own name for a subject ("GCSE Maths", "Biology 9-1")
 *  mean the catalogue's canonical one? */
export function subjectIs(canonical: string, name: string): boolean {
  const s = name.trim().toLowerCase();
  if (!s) return false;
  return canonical === "Mathematics" ? s.includes("math") : s.includes(canonical.toLowerCase());
}

/** The habits in play that touch a subject: it has an open row of that kind,
 *  or (carry-over) the kind was fixed there. For a subject page. */
export function habitsForSubject(habits: readonly ActiveHabit[], subjectName: string): ActiveHabit[] {
  return habits.filter(
    (h) =>
      h.openSubjects.some((s) => subjectIs(s, subjectName)) ||
      h.fixedSubjects.some((s) => subjectIs(s, subjectName)),
  );
}
