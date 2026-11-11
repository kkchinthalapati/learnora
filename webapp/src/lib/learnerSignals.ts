/* How a student responds to what Learnora writes, and what that changes.
 *
 * What a student tells us about how they learn lives on their study profile
 * ("How you learn", lib/learnerProfile.ts): set once in onboarding, changed in
 * Settings. These are what they do afterwards: which parts of a lesson they
 * got first time, which "explain it another way" they reach for, and how
 * they rate a lesson. Stored in `learner_signals` (api/learnerSignals.ts);
 * everything here is pure.
 *
 * What comes out:
 *  - `steerRule`: the standing preferences from the profile ("Shorter"…), as
 *    a prompt line. Defined here with the ids they share with ratings.
 *  - `feedbackRule`: what recent "not quite" ratings said was wrong, as a
 *    prompt line, so the next explanation avoids it.
 *  - `suggestStyle`: when what they do disagrees with the style they picked,
 *    a suggestion shown in Settings that they can take or leave. Never
 *    applied silently: a student who picked a style chose it.
 *
 * Like the learner style, none of it may change what is true: these lines
 * reshape presentation and pitch, never content. */

import { LEARNER_STYLES, learnerStyleOption, type LearnerStyle } from "./learnerStyle";

export const SIGNAL_KINDS = ["section_result", "reteach_pick", "rating"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_SURFACES = ["learn", "notes", "podcast", "chat", "quiz", "detective", "call"] as const;
export type SignalSurface = (typeof SIGNAL_SURFACES)[number];

export interface LearnerSignal {
  kind: SignalKind;
  surface: SignalSurface;
  /** The learner style that was active when it happened. */
  style: string | null;
  /** A fixed id: a reteach style or a rating reason. */
  value: string | null;
  /** section_result: 2 first time, 1 relearned, 0 to revisit.
   *  rating: 1 up, -1 down. */
  score: number | null;
  topicKey: string | null;
  ref: string | null;
  createdAt: string;
}

/** A Learn part's outcome as a section_result score. */
export const SECTION_SCORE = { got: 2, relearned: 1, revisit: 0 } as const;

const DAY = 86_400_000;
const age = (s: LearnerSignal, now: number) => now - Date.parse(s.createdAt);
const byTime = (a: LearnerSignal, b: LearnerSignal) => Date.parse(a.createdAt) - Date.parse(b.createdAt);

/* --- Standing preferences (saved on the study profile) --------------------- */

export const STEERS = [
  {
    id: "more_examples",
    label: "More examples",
    rule: "Give an extra concrete example for each main idea.",
  },
  {
    id: "shorter",
    label: "Shorter",
    rule: "Keep explanations short: cut every sentence that doesn't teach something, about two-thirds of the usual length. Never drop an idea the material needs.",
  },
  {
    id: "simpler",
    label: "Simpler words",
    rule: "Use simpler, everyday words and short sentences, and define every technical term the moment it appears.",
  },
  {
    id: "deeper",
    label: "Go deeper",
    rule: "Go one level deeper than usual: explain the why behind each step and point out one common edge case, staying within the material.",
  },
  {
    id: "quiz_first",
    label: "Quiz me first",
    rule: "Open each idea with a short question for the student to think about before it is explained.",
  },
  {
    id: "more_visual",
    label: "More diagrams",
    rule: "Wherever a process, structure or comparison is involved, show it as a table or a diagram as well as in words.",
  },
] as const;
export type SteerId = (typeof STEERS)[number]["id"];

const STEER_IDS = new Set<string>(STEERS.map((s) => s.id));
export const isSteer = (v: unknown): v is SteerId => typeof v === "string" && STEER_IDS.has(v);

/** Turning one of these on turns its opposite off. */
export const STEER_OPPOSITES: Partial<Record<SteerId, SteerId[]>> = {
  shorter: ["deeper"],
  deeper: ["shorter", "simpler"],
  simpler: ["deeper"],
};

/** The prompt line for the student's standing preferences, or "". */
export function steerRule(steers: readonly SteerId[]): string {
  const rules = STEERS.filter((s) => steers.includes(s.id));
  if (!rules.length) return "";
  return `THE STUDENT'S STANDING PREFERENCES (they chose these; follow them unless one would make something untrue or leave out what the material needs):\n${rules.map((r) => `- ${r.rule}`).join("\n")}`;
}

/* --- Ratings ---------------------------------------------------------------- */

export const RATING_REASONS = [
  { id: "too_long", label: "Too long", rule: "Several were rated too long: keep it noticeably shorter." },
  { id: "too_basic", label: "Too basic", rule: "Several were rated too basic: assume the basics and move a step faster." },
  { id: "too_hard", label: "Too hard", rule: "Several were rated too hard: take smaller steps and explain each in plain English." },
  { id: "confusing", label: "Confusing", rule: "Several were rated confusing: build each idea on the one before and say plainly what each step is for." },
  {
    id: "wrong",
    label: "Something's wrong",
    rule: "The student reported a mistake: solve every question yourself and check each fact against the material before writing it. Where the material doesn't say, say so rather than guess.",
  },
  {
    id: "not_my_notes",
    label: "Not what my notes say",
    rule: "The student reported content their notes don't support: stay strictly within the material.",
  },
] as const;
export type RatingReason = (typeof RATING_REASONS)[number]["id"];

const REASON_IDS = new Set<string>(RATING_REASONS.map((r) => r.id));
export const isRatingReason = (v: unknown): v is RatingReason => typeof v === "string" && REASON_IDS.has(v);

/** Ratings older than this stop shaping prompts: an explanation they found
 *  too hard in September says little about them in November. */
export const RATING_WINDOW_DAYS = 30;
/** Only the latest ratings count, so one bad week doesn't outweigh a good month. */
const RATING_RECENT = 20;
/* A report of a mistake counts at once: being careful costs nothing. Taste
   ("too long") needs saying twice before it changes every lesson. */
const REASON_THRESHOLD: Partial<Record<RatingReason, number>> = { wrong: 1, not_my_notes: 1 };

/** The reasons recent thumbs-downs agree on, in RATING_REASONS order. */
export function ratingFindings(signals: readonly LearnerSignal[], now = Date.now()): RatingReason[] {
  const recent = signals
    .filter((s) => s.kind === "rating" && age(s, now) <= RATING_WINDOW_DAYS * DAY)
    .sort(byTime)
    .slice(-RATING_RECENT);
  const downs = new Map<RatingReason, number>();
  for (const s of recent) {
    if (s.score === -1 && isRatingReason(s.value)) downs.set(s.value, (downs.get(s.value) ?? 0) + 1);
  }
  const found = RATING_REASONS.map((r) => r.id).filter((id) => (downs.get(id) ?? 0) >= (REASON_THRESHOLD[id] ?? 2));
  /* "Too basic" and "too hard" pull opposite ways: keep the one said more,
     or neither when it's a tie. */
  if (found.includes("too_basic") && found.includes("too_hard")) {
    const basic = downs.get("too_basic")!;
    const hard = downs.get("too_hard")!;
    return found.filter((id) => (id === "too_basic" ? basic > hard : id === "too_hard" ? hard > basic : true));
  }
  return found;
}

/** The prompt line for what recent ratings said, or "". */
export function feedbackRule(signals: readonly LearnerSignal[], now = Date.now()): string {
  const found = ratingFindings(signals, now);
  if (!found.length) return "";
  const rules = RATING_REASONS.filter((r) => found.includes(r.id)).map((r) => `- ${r.rule}`);
  return `WHAT THIS STUDENT SAID ABOUT RECENT EXPLANATIONS (adjust for it; never mention it to them):\n${rules.join("\n")}`;
}

/* --- Style suggestion ---------------------------------------------------- */

/** Which learner style a reteach pick or a steer points at. "Simpler" and
 *  "shorter" are about pitch, not style, so they point nowhere. */
const POINTS_TO: Record<string, LearnerStyle> = {
  /* Learn's "explain it another way" chips (api/learn.ts LEARN_STYLES). */
  steps: "examples",
  example: "application",
  analogy: "talk",
  /* Standing preferences. */
  more_examples: "examples",
  quiz_first: "practice",
  more_visual: "visual",
};

export interface StyleSuggestion {
  style: LearnerStyle;
  /** One sentence, to the student, saying what we saw. */
  reason: string;
}

const RESULT_WINDOW_DAYS = 60;
const PICK_WINDOW_DAYS = 45;
const isStyle = (v: unknown): v is LearnerStyle => typeof v === "string" && (LEARNER_STYLES as readonly string[]).includes(v);
const lower = (style: LearnerStyle) => learnerStyleOption(style).label.toLowerCase();

/** A better-fitting style, when what the student does says so; else null.
 *  Results come first: parts got first time are better evidence than what
 *  they clicked. Thresholds are deliberately high, since a wrong suggestion
 *  costs the student's trust in the rest. */
export function suggestStyle(
  signals: readonly LearnerSignal[],
  current: LearnerStyle | null,
  now = Date.now(),
  prefs: readonly SteerId[] = [],
): StyleSuggestion | null {
  /* 1. How parts went, by the style they were taught in. */
  const tally = new Map<LearnerStyle, { n: number; first: number }>();
  for (const s of signals) {
    if (s.kind !== "section_result" || !isStyle(s.style) || age(s, now) > RESULT_WINDOW_DAYS * DAY) continue;
    const t = tally.get(s.style) ?? { n: 0, first: 0 };
    t.n += 1;
    if (s.score === SECTION_SCORE.got) t.first += 1;
    tally.set(s.style, t);
  }
  const mine = current ? tally.get(current) : undefined;
  if (current && mine && mine.n >= 6 && mine.first / mine.n < 0.5) {
    let best: [LearnerStyle, { n: number; first: number }] | null = null;
    for (const [style, t] of tally) {
      if (style === current || t.n < 4) continue;
      if (t.first / t.n < mine.first / mine.n + 0.25) continue;
      if (!best || t.first / t.n > best[1].first / best[1].n) best = [style, t];
    }
    if (best) {
      return {
        style: best[0],
        reason: `Parts taught with ${lower(best[0])}: you got ${best[1].first} of ${best[1].n} first time. With ${lower(current)}: ${mine.first} of ${mine.n}.`,
      };
    }
  }

  /* 2. What they keep asking for. A standing preference counts double: it
        is a request for every lesson, not one part. */
  const asks = new Map<LearnerStyle, number>();
  for (const s of signals) {
    if (s.kind !== "reteach_pick" || age(s, now) > PICK_WINDOW_DAYS * DAY) continue;
    const style = s.value ? POINTS_TO[s.value] : undefined;
    if (style) asks.set(style, (asks.get(style) ?? 0) + 1);
  }
  for (const id of prefs) {
    const style = POINTS_TO[id];
    if (style) asks.set(style, (asks.get(style) ?? 0) + 2);
  }
  const total = [...asks.values()].reduce((a, b) => a + b, 0);
  const top = [...asks].sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] !== current && top[1] >= 3 && top[1] / total >= 0.6) {
    return {
      style: top[0],
      reason: current
        ? `You keep asking for ${lower(top[0])}, though lessons are shaped for ${lower(current)}.`
        : `You keep asking for ${lower(top[0])}.`,
    };
  }
  return null;
}
