/**
 * The misconception ledger — pure logic.
 *
 * `lib/studentEvidence.ts` answers "how is this student scoring?". This module
 * answers the question that actually changes what you'd teach them: "what does
 * this student currently believe that is wrong?"
 *
 * Every AI instrument in the app already computes that and drops it on the
 * floor. The extractors at the bottom of this file are the recovery: each one
 * takes a tool's existing result type — untouched, no prompt changes — and
 * reads the diagnosis already sitting inside it. `api/misconceptions.ts` writes
 * what they return; `formatMisconceptionsForPrompt` feeds it back to every AI
 * surface; `rankMisconceptions` orders it for the features that schedule time.
 *
 * Kept free of Supabase for the same reason `studentEvidence` is: the merge
 * rule and the ranking are the parts worth testing, and they should be
 * testable without a database double.
 */

import { fenceUntrusted } from "./actionTags";

export type MisconceptionStatus = "open" | "improving" | "resolved";
export type MisconceptionSeverity = "critical" | "moderate" | "minor";
export type MisconceptionTool =
  | "debugger"
  | "feynman"
  | "premortem"
  | "sparring"
  | "quiz"
  | "notes"
  | "review"
  | "exam-detective";
export type ObservationKind = "evidence" | "correction";

/** A row of `public.misconceptions`. */
export interface Misconception {
  id: string;
  subject: string;
  /** Human-readable name of the concept the error lives in. */
  concept: string;
  /** Normalised form of `concept`; the dedupe key. See `conceptKey`. */
  conceptKey: string;
  /** The wrong belief itself, as diagnosed. */
  summary: string;
  status: MisconceptionStatus;
  severity: MisconceptionSeverity;
  originTool: MisconceptionTool;
  timesObserved: number;
  timesCorrected: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

/** A row of `public.misconception_observations`. */
export interface MisconceptionObservation {
  id: string;
  misconceptionId: string;
  sourceTool: MisconceptionTool;
  sourceId: string | null;
  kind: ObservationKind;
  detail: string;
  occurredAt: string;
}

/**
 * What an extractor produces: a diagnosis, not yet a row. The API layer
 * resolves it against the ledger — creating a row or merging into an existing
 * one — and appends the observation.
 */
export interface MisconceptionCandidate {
  subject: string;
  concept: string;
  summary: string;
  severity: MisconceptionSeverity;
  tool: MisconceptionTool;
  sourceId?: string;
  /** `evidence` when the tool caught the error, `correction` when the student
   *  demonstrated they now have it right. Extractors emit both. */
  kind: ObservationKind;
  /** Verbatim quote of what happened, for showing back to the student. */
  detail: string;
}

/** Below this, a concept name is noise rather than a diagnosis — a stray
 *  fragment from a model that returned a partial object. Dropped rather than
 *  written, since a ledger full of one-word rows is worse than a short one. */
export const MIN_CONCEPT_LENGTH = 3;

/** Concept names longer than this are almost always a whole explanation that
 *  landed in the wrong field. Truncated for the key, kept whole for display. */
const MAX_KEY_LENGTH = 120;

/** How many ledger entries a prompt carries. The same budget reasoning as
 *  `MAX_PROMPT_TOPICS` in studentEvidence: past roughly a dozen, the model
 *  stops treating any single one as important. */
export const MAX_PROMPT_MISCONCEPTIONS = 10;

/** Words that carry no distinguishing meaning in a concept name. Stripped for
 *  the key so "the rule of hydrolysis" and "hydrolysis rule" collapse to one
 *  row instead of accumulating as two. */
const FILLER = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "to",
  "and",
  "or",
  "is",
  "are",
  "that",
  "this",
  "how",
  "why",
  "what",
  "when",
  "with",
  "about",
  "student",
  "thinks",
  "believes",
  "confusion",
  "misconception",
  "concept",
  "rule",
  "idea",
]);

/**
 * The dedupe key.
 *
 * Six tools describe one belief six ways: the Debugger calls it "Conservation
 * of mass", Feynman writes "the student believes mass is not conserved",
 * Pre-Mortem logs "Mass conservation trap". Without normalisation the ledger
 * grows a separate row per tool and the recurrence signal — the single most
 * valuable thing here — never fires.
 *
 * Lowercase, strip punctuation, drop filler words, sort the remainder. Sorting
 * is what makes it word-order independent, which is where most of the
 * cross-tool variation actually lives.
 */
export function conceptKey(raw: string): string {
  const words = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    /* Possessives before punctuation, so "Châtelier's principle" and
       "Chatelier principle" agree instead of differing by a stray "s". */
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    /* Single characters are always noise here — the leftovers of stripped
       punctuation, never a concept name a tool would emit on its own. */
    .filter((w) => w.length > 1 && !FILLER.has(w));

  /* Everything was filler — "the concept of the rule". Fall back to the
     flattened original so the row still gets a stable key rather than an
     empty one that would collide with every other such case. */
  if (words.length === 0) {
    return raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_KEY_LENGTH);
  }

  return [...new Set(words)].sort().join(" ").slice(0, MAX_KEY_LENGTH);
}

/** Trim and collapse whitespace, matching `normaliseTopic` in studentEvidence. */
function tidy(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Whether a candidate is worth writing. Model output reaches these extractors
 * with empty strings and placeholder text in it; a ledger is only useful if a
 * student trusts every row in it, so the bar for entry is deliberately high.
 */
export function isUsableCandidate(c: MisconceptionCandidate): boolean {
  const concept = tidy(c.concept);
  if (concept.length < MIN_CONCEPT_LENGTH) return false;
  if (/^(n\/?a|none|unknown|null|undefined|tbd|-+)$/i.test(concept)) return false;
  return conceptKey(concept).length > 0;
}

/** Normalise a candidate for writing: tidy the text fields and drop anything
 *  that fails `isUsableCandidate`. */
export function prepareCandidates(
  candidates: MisconceptionCandidate[],
): MisconceptionCandidate[] {
  const seen = new Set<string>();
  const out: MisconceptionCandidate[] = [];

  for (const raw of candidates) {
    const candidate: MisconceptionCandidate = {
      ...raw,
      subject: tidy(raw.subject ?? ""),
      concept: tidy(raw.concept ?? ""),
      summary: tidy(raw.summary ?? ""),
      detail: tidy(raw.detail ?? ""),
    };
    if (!isUsableCandidate(candidate)) continue;

    /* One tool result routinely names the same belief twice — Feynman's draft
       lists a misconception and the teaching turn's confusionPoints repeats it.
       Collapsing here keeps a single call from inflating times_observed by
       three, which would make the recurrence count a lie. */
    const dedupe = `${candidate.subject}::${conceptKey(candidate.concept)}::${candidate.kind}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(candidate);
  }

  return out;
}

/* ── Ranking ─────────────────────────────────────────────────────────────── */

const SEVERITY_WEIGHT: Record<MisconceptionSeverity, number> = {
  critical: 3,
  moderate: 2,
  minor: 1,
};

/** A misconception stops being urgent if it has not been seen in a long time,
 *  but it never stops mattering — so recency scales the score rather than
 *  gating it. Half-weight at four weeks. */
const RECENCY_HALF_LIFE_DAYS = 28;

/**
 * How much attention a row deserves, 0 upward. Read by the plan, review
 * scheduling and quiz generation, so it is one function rather than three
 * slightly different opinions.
 *
 * Recurrence dominates on purpose. A critical-severity row seen once is a
 * model's guess; a moderate one seen four times across two tools is a fact
 * about the student, and it should outrank the guess.
 */
export function misconceptionPriority(
  m: Misconception,
  now: Date = new Date(),
): number {
  if (m.status === "resolved") return 0;

  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(m.lastSeenAt).getTime()) / 86_400_000,
  );
  const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

  /* Corrections earn real credit but cannot zero the score: the row is still
     open, and "they got it right twice then missed it again" is exactly the
     case that must stay visible. */
  const netEvidence = Math.max(1, m.timesObserved - m.timesCorrected * 0.5);

  const statusBoost = m.status === "open" ? 1 : 0.6;

  return SEVERITY_WEIGHT[m.severity] * netEvidence * recency * statusBoost;
}

/** Unresolved rows, most urgent first. */
export function rankMisconceptions(
  all: Misconception[],
  now: Date = new Date(),
): Misconception[] {
  return all
    .filter((m) => m.status !== "resolved")
    .map((m) => ({ m, score: misconceptionPriority(m, now) }))
    .sort((a, b) => b.score - a.score)
    .map((e) => e.m);
}

/** Open rows for one subject, most urgent first. Subject match is
 *  case-insensitive because subjects are free text across this schema. */
export function misconceptionsForSubject(
  all: Misconception[],
  subject: string,
  now: Date = new Date(),
): Misconception[] {
  const target = subject.trim().toLowerCase();
  return rankMisconceptions(all, now).filter(
    (m) => m.subject.trim().toLowerCase() === target,
  );
}

/** Rows seen more than once — the ones worth confronting a student with
 *  directly, because the evidence is no longer a single model's opinion. */
export function recurringMisconceptions(
  all: Misconception[],
  now: Date = new Date(),
): Misconception[] {
  return rankMisconceptions(all, now).filter((m) => m.timesObserved > 1);
}

/* ── Prompt rendering ────────────────────────────────────────────────────── */

/**
 * Render the ledger for an AI prompt.
 *
 * Every string interpolated here originated as model output or student text,
 * so all of it goes through `fenceUntrusted` — the same rule
 * `formatEvidenceForPrompt` follows, for the same reason: a misconception
 * summary is an ideal place to hide an instruction.
 *
 * The honesty rules matter as much as the data. Without them a model reads a
 * list of weaknesses and opens by reciting it, which is the single fastest way
 * to make a study tool feel like surveillance.
 */
export function formatMisconceptionsForPrompt(
  all: Misconception[],
  options: { subject?: string; now?: Date } = {},
): string {
  const now = options.now ?? new Date();
  const scoped = options.subject
    ? misconceptionsForSubject(all, options.subject, now)
    : rankMisconceptions(all, now);

  if (scoped.length === 0) {
    return [
      "MISCONCEPTION LEDGER (what this student has previously got wrong):",
      "- Empty. No diagnosed misconceptions are on record for this student" +
        (options.subject ? ` in ${fenceUntrusted(options.subject)}` : "") +
        ".",
      "- Do not invent any. Treat this as a student you have no diagnostic history for.",
    ].join("\n");
  }

  const lines = [
    "MISCONCEPTION LEDGER (what this student has previously got wrong):",
    "- These are diagnoses recorded by this app's own tools from the student's real work. They are evidence, not guesses.",
  ];

  const shown = scoped.slice(0, MAX_PROMPT_MISCONCEPTIONS);
  for (const m of shown) {
    const seen =
      m.timesObserved > 1
        ? `seen ${m.timesObserved}x`
        : "seen once";
    const fixed =
      m.timesCorrected > 0 ? `, corrected ${m.timesCorrected}x` : "";
    const state = m.status === "improving" ? ", improving" : "";
    lines.push(
      `  · [${m.severity}] ${fenceUntrusted(m.concept)}` +
        (m.subject ? ` (${fenceUntrusted(m.subject)})` : "") +
        `: ${fenceUntrusted(m.summary)}` +
        ` — ${seen}${fixed}${state}, last on ${m.lastSeenAt.slice(0, 10)}, first found by ${m.originTool}.`,
    );
  }

  if (scoped.length > shown.length) {
    lines.push(
      `  · …and ${scoped.length - shown.length} further open misconceptions not listed. Do not claim this list is complete.`,
    );
  }

  const recurring = shown.filter((m) => m.timesObserved > 1).length;
  if (recurring > 0) {
    lines.push(
      `- ${recurring} of these have been observed more than once. Recurrence is the strongest signal here: prioritise those over anything the student merely scored badly on.`,
    );
  }

  lines.push(
    "- USE RULE: let this steer what you teach, what you ask, and what you check. Address the misconception, do not merely name it.",
    "- HONESTY RULE: never recite this list back to the student as a report card, and never claim a misconception is fixed unless they have just demonstrated otherwise in this session.",
  );

  return lines.join("\n");
}

/* ── Extractors ──────────────────────────────────────────────────────────── */
/* Each takes a tool's existing result type and reads the diagnosis already in
   it. Structural types are used rather than imports from `api/ai*.ts` so this
   module stays dependency-free and testable, and so a field added upstream
   cannot break the ledger. */

interface StackTraceLike {
  id?: string;
  subject?: string;
  failedQuestionOrTopic?: string;
  rootCauseSummary?: string;
  layers?: Array<{
    concept?: string;
    status?: string;
    explanation?: string;
  }>;
}

/**
 * Cognitive Debugger → ledger.
 *
 * A `severed` layer is the broken prerequisite the whole trace was built to
 * find, so it is recorded as critical. `shaky` is the model hedging, and lands
 * as moderate. `healthy` layers are not silence — they are the trace asserting
 * the student *does* hold that prerequisite, which is a correction if the
 * ledger already disagrees.
 */
export function candidatesFromStackTrace(
  trace: StackTraceLike,
): MisconceptionCandidate[] {
  const subject = trace.subject ?? "";
  const context = trace.failedQuestionOrTopic ?? "";

  const out = (trace.layers ?? []).flatMap<MisconceptionCandidate>((layer) => {
    const concept = layer.concept ?? "";
    if (layer.status === "severed" || layer.status === "shaky") {
      return [
        {
          subject,
          concept,
          summary: layer.explanation ?? trace.rootCauseSummary ?? "",
          severity: layer.status === "severed" ? "critical" : "moderate",
          tool: "debugger",
          sourceId: trace.id,
          kind: "evidence",
          detail: context
            ? `Traced from: ${context}`
            : (trace.rootCauseSummary ?? ""),
        },
      ];
    }
    if (layer.status === "healthy") {
      return [
        {
          subject,
          concept,
          summary: layer.explanation ?? "",
          severity: "minor",
          tool: "debugger",
          sourceId: trace.id,
          kind: "correction",
          detail: "The debugger found this prerequisite intact.",
        },
      ];
    }
    return [];
  });

  return prepareCandidates(out);
}

interface ApprenticeDraftLike {
  id?: string;
  subject?: string;
  topic?: string;
  hiddenMisconceptions?: Array<{
    concept?: string;
    misconception?: string;
    explanation?: string;
    snippet?: string;
  }>;
}

interface TeachingTurnLike {
  id?: string;
  confusionPoints?: string[];
  solvedPoints?: string[];
  understandingScore?: number;
}

/**
 * Feynman → ledger.
 *
 * Only the teaching turn is read, never the draft's `hiddenMisconceptions` on
 * their own: those are errors the app *planted* for the student to find, so
 * recording them would fill the ledger with beliefs the student never held.
 * The draft is passed in solely to name the subject and topic that a turn's
 * bare `confusionPoints` strings lack.
 *
 * `confusionPoints` are what the student failed to resolve — evidence.
 * `solvedPoints` are what they successfully corrected — corrections.
 */
export function candidatesFromTeachingTurn(
  turn: TeachingTurnLike,
  draft: ApprenticeDraftLike,
): MisconceptionCandidate[] {
  const subject = draft.subject ?? "";
  const topic = draft.topic ?? "";

  const confusion = (turn.confusionPoints ?? []).map<MisconceptionCandidate>(
    (point) => ({
      subject,
      concept: point,
      summary: topic
        ? `Unresolved while teaching ${topic}: ${point}`
        : point,
      severity: "moderate",
      tool: "feynman",
      sourceId: turn.id ?? draft.id,
      kind: "evidence",
      detail: `The apprentice was left confused about this after the student's explanation.`,
    }),
  );

  const solved = (turn.solvedPoints ?? []).map<MisconceptionCandidate>(
    (point) => ({
      subject,
      concept: point,
      summary: topic ? `Explained correctly while teaching ${topic}` : "",
      severity: "minor",
      tool: "feynman",
      sourceId: turn.id ?? draft.id,
      kind: "correction",
      detail: "The student explained this correctly to the apprentice.",
    }),
  );

  return prepareCandidates([...confusion, ...solved]);
}

interface PreMortemReportLike {
  id?: string;
  subject?: string;
  examName?: string;
  predictedFailures?: Array<{
    topic?: string;
    coreTrap?: string;
    failureProbability?: number;
    predictedLostMarks?: number;
  }>;
}

/**
 * Pre-Mortem → ledger.
 *
 * The radar's predictions are grounded in stress questions the student just
 * answered, so a predicted failure is an observed one. `failureProbability`
 * carries the severity: the report already distinguishes "likely to lose marks
 * here" from "might", and flattening that would waste the only calibrated
 * number any of these tools produce.
 */
export function candidatesFromPreMortem(
  report: PreMortemReportLike,
): MisconceptionCandidate[] {
  const subject = report.subject ?? "";
  const where = report.examName ? ` for ${report.examName}` : "";

  const out = (report.predictedFailures ?? []).map<MisconceptionCandidate>(
    (failure) => {
      const probability = failure.failureProbability ?? 0;
      return {
        subject,
        concept: failure.topic ?? "",
        summary: failure.coreTrap ?? "",
        severity:
          probability >= 70
            ? "critical"
            : probability >= 40
              ? "moderate"
              : "minor",
        tool: "premortem",
        sourceId: report.id,
        kind: "evidence",
        detail:
          `Pre-mortem${where} put failure on this at ${Math.round(probability)}%` +
          (failure.predictedLostMarks
            ? ` (${failure.predictedLostMarks} marks at risk).`
            : "."),
      };
    },
  );

  return prepareCandidates(out);
}

interface SparringFeedbackLike {
  missingPoints?: string[];
  keyConceptsMastered?: string[];
  accuracyScore?: number;
}

/**
 * Sparring → ledger.
 *
 * `missingPoints` is the weaker signal in this file: the student may know a
 * point and simply not have said it under debate pressure. It is recorded at
 * `minor` so a single sparring round cannot outrank a Debugger trace, and so
 * it only becomes prominent through recurrence — which is the correct bar for
 * an omission.
 */
export function candidatesFromSparring(
  feedback: SparringFeedbackLike,
  context: { subject?: string; topic?: string; sessionId?: string },
): MisconceptionCandidate[] {
  const subject = context.subject ?? "";
  const topic = context.topic ?? "";

  const missing = (feedback.missingPoints ?? []).map<MisconceptionCandidate>(
    (point) => ({
      subject,
      concept: point,
      summary: topic ? `Not addressed when arguing ${topic}` : point,
      severity: "minor",
      tool: "sparring",
      sourceId: context.sessionId,
      kind: "evidence",
      detail: "The student's argument left this point out under challenge.",
    }),
  );

  const mastered = (
    feedback.keyConceptsMastered ?? []
  ).map<MisconceptionCandidate>((point) => ({
    subject,
    concept: point,
    summary: topic ? `Defended correctly while arguing ${topic}` : "",
    severity: "minor",
    tool: "sparring",
    sourceId: context.sessionId,
    kind: "correction",
    detail: "The student defended this correctly under challenge.",
  }));

  return prepareCandidates([...missing, ...mastered]);
}

/**
 * Quiz → ledger.
 *
 * The one extractor whose input is not a model diagnosis but a fact: they
 * picked the wrong option. Severity is left moderate because a single wrong
 * answer is weak evidence of a *belief* — it may be a slip — and recurrence is
 * what promotes it. Correct answers are recorded too, so quizzing is how a
 * ledger row gets closed by ordinary study rather than a special ritual.
 */
export function candidatesFromQuizAnswers(
  answers: Array<{
    topic?: string;
    correct?: boolean;
    question?: string;
    chosen?: string;
  }>,
  context: { subject?: string; attemptId?: string },
): MisconceptionCandidate[] {
  const subject = context.subject ?? "";

  const out = answers.flatMap<MisconceptionCandidate>((answer) => {
    const topic = answer.topic ?? "";
    if (!topic) return [];
    return [
      {
        subject,
        concept: topic,
        summary: answer.correct
          ? ""
          : answer.question
            ? `Missed: ${answer.question}`
            : `Answered incorrectly on ${topic}`,
        severity: "moderate",
        tool: "quiz",
        sourceId: context.attemptId,
        kind: answer.correct ? "correction" : "evidence",
        detail: answer.correct
          ? `Answered correctly on ${topic}.`
          : answer.chosen
            ? `Chose "${answer.chosen}".`
            : `Answered incorrectly on ${topic}.`,
      },
    ];
  });

  return prepareCandidates(out);
}

/* ── Review ──────────────────────────────────────────────────────────────── */

/** FSRS difficulty (1..10) at or above which a card is already known to be a
 *  problem for this student, not a fresh slip. */
export const HARD_DIFFICULTY = 7;

/** SM-2 ease at or below which the same is true. Cards start at 2.5 and only
 *  fall by lapsing, so 2.0 means the student has already failed this card
 *  roughly three times. Read as a fallback for pre-FSRS cards, which carry no
 *  `difficulty`. */
export const HARD_EASE = 2.0;

/** An interval this long means the card had genuinely bedded in. Failing one
 *  is the most informative single event in the whole review loop: it is not a
 *  card they never learned, it is a belief that has decayed or was wrong all
 *  along. */
export const ESTABLISHED_INTERVAL_DAYS = 21;

/** How many rows one review session may add. A forty-card session with
 *  fifteen lapses would otherwise bury the ledger's conceptual diagnoses under
 *  a list of individual card fronts, and a ledger nobody can read is a ledger
 *  nobody trusts. The hardest lapses win the slots. */
export const MAX_REVIEW_CANDIDATES = 5;

/** Card fields the extractor reads. Structurally a subset of `Flashcard`, so
 *  callers pass their cards straight through — but declared here rather than
 *  imported, to keep this module free of the API layer like the rest of it. */
export interface ReviewedCard {
  front: string;
  /** FSRS difficulty, 1..10. Absent on cards last reviewed before the column. */
  difficulty?: number | null;
  /** SM-2 ease factor. The pre-FSRS stand-in for `difficulty`. */
  ease_factor?: number | null;
  /** Days until the card was next due, as of before this grade. */
  srs_interval?: number | null;
}

/**
 * Whether the student was already failing this card before today.
 *
 * This is the whole reason the review extractor is worth having. One "Again"
 * is a slip and the ledger should not care; the *same* card failing again
 * after the scheduler has already shortened its interval three times is the
 * app watching a wrong belief survive repeated correction, which is exactly
 * what the ledger exists to record.
 */
export function wasAlreadyHard(card: ReviewedCard): boolean {
  if (typeof card.difficulty === "number") return card.difficulty >= HARD_DIFFICULTY;
  if (typeof card.ease_factor === "number") return card.ease_factor <= HARD_EASE;
  return false;
}

/** A card that had bedded in and then broke. Treated as strongly as a
 *  chronically hard card, for the opposite reason: not "never learned" but
 *  "learned and lost", and both deserve a block of someone's afternoon. */
function wasEstablished(card: ReviewedCard): boolean {
  return (card.srs_interval ?? 0) >= ESTABLISHED_INTERVAL_DAYS;
}

/**
 * Spaced repetition, read as diagnosis rather than as scheduling.
 *
 * Every other extractor in this file recovers a diagnosis a model already
 * made. This one recovers a fact the app measured itself, and it is the
 * highest-frequency evidence Learnora holds: a student answers a handful of
 * quiz questions a week and grades hundreds of cards. Until now all of it went
 * into `next_review_date` and nowhere else — the scheduler knew a card kept
 * failing, and no other surface in the app could find out.
 *
 * Only "Again" (quality <= 1) is a lapse; "Hard" is a successful recall that
 * hurt, which `views/review/srs.ts` is careful about for the same reason.
 * Confident recall of a card that *used* to be hard is emitted as a
 * correction, so ordinary revision is what closes a ledger row — a student
 * should never have to perform a ritual to prove they have fixed something.
 */
export function candidatesFromReviewLapses(
  results: Array<{ card: ReviewedCard; quality: number }>,
  context: { subject?: string; sessionId?: string },
): MisconceptionCandidate[] {
  const subject = context.subject ?? "";

  const scored = results.flatMap<{ weight: number; candidate: MisconceptionCandidate }>(
    ({ card, quality }) => {
      const concept = tidy(card.front ?? "");
      if (!concept) return [];

      const hard = wasAlreadyHard(card);
      const established = wasEstablished(card);

      if (quality <= 1) {
        const why = hard
          ? "a card they have failed repeatedly before"
          : established
            ? `a card that had been holding for ${card.srs_interval} days`
            : "";
        return [
          {
            /* Chronic failures and broken-in cards outrank one-off slips for
               the session's five slots. */
            weight: hard ? 3 : established ? 2 : 1,
            candidate: {
              subject,
              concept,
              summary: `Could not recall: ${concept}`,
              severity: hard || established ? "critical" : "moderate",
              tool: "review",
              sourceId: context.sessionId,
              kind: "evidence",
              detail: why
                ? `Graded "Again" in review — ${why}.`
                : `Graded "Again" in review.`,
            },
          },
        ];
      }

      /* A correction is only news about a card that was in trouble. Recalling
         an easy card confidently is the overwhelming majority of every review
         session and says nothing the ledger did not already assume. */
      if (quality >= 3 && (hard || established)) {
        return [
          {
            weight: 1,
            candidate: {
              subject,
              concept,
              summary: "",
              severity: "moderate",
              tool: "review",
              sourceId: context.sessionId,
              kind: "correction",
              detail: `Recalled confidently in review after previously failing it.`,
            },
          },
        ];
      }

      return [];
    },
  );

  /* Stable sort by weight: within a weight the student's own review order is
     kept, so the slots that survive are the ones they met first. */
  const ordered = scored
    .map((entry, i) => ({ ...entry, i }))
    .sort((a, b) => b.weight - a.weight || a.i - b.i)
    .map((entry) => entry.candidate);

  /* Deduped first, capped second. The other order would spend slots on
     repeats of one card and silently drop four distinct problems. */
  return prepareCandidates(ordered).slice(0, MAX_REVIEW_CANDIDATES);
}

/* ── Exam Detective ──────────────────────────────────────────────────────── */

/**
 * The Challenge Sprint, read as diagnosis.
 *
 * Every other extractor here works from a model's opinion or from a plain
 * wrong answer. This one has something none of them do: the question was
 * *built* around a named trap, and the distractor the student picked came with
 * a written explanation of the belief that makes it look right. Falling for it
 * is not a slip, and the ledger does not have to guess what the student
 * thinks — the sprint already wrote it down.
 *
 * So bait answers are filed `critical` on first sight, which no other single
 * observation in this file earns. A wrong answer that is *not* the bait is a
 * different event — they missed it without the trap catching them — and is
 * filed as ordinary moderate evidence against the topic instead.
 *
 * The concept is the trap, not the topic. "Sign error when the limit is
 * approached from below" is a belief a student can fix; "Calculus" is not.
 */
export function candidatesFromTrapSprint(
  questions: Array<{
    trapName?: string;
    trapExplanation?: string;
    baitExplanation?: string;
    topic?: string;
    correctAnswerIndex: number;
    baitOptionIndex: number;
  }>,
  answers: Array<number | null>,
  context: { subject?: string; sprintId?: string },
): MisconceptionCandidate[] {
  const subject = context.subject ?? "";

  const out = questions.flatMap<MisconceptionCandidate>((q, i) => {
    const chosen = answers[i];
    /* Unanswered is not evidence of anything. A sprint the student abandoned
       halfway would otherwise file every remaining trap against them. */
    if (chosen == null) return [];

    const concept = q.trapName ?? q.topic ?? "";
    if (!concept) return [];

    if (chosen === q.baitOptionIndex) {
      return [
        {
          subject,
          concept,
          summary:
            q.baitExplanation ||
            q.trapExplanation ||
            `Fell for the ${concept} trap`,
          severity: "critical",
          tool: "exam-detective",
          sourceId: context.sprintId,
          kind: "evidence",
          detail: `Chose the bait answer on a question written to detect this trap.`,
        },
      ];
    }

    if (chosen === q.correctAnswerIndex) {
      return [
        {
          subject,
          concept,
          summary: "",
          severity: "moderate",
          tool: "exam-detective",
          sourceId: context.sprintId,
          kind: "correction",
          /* Worth distinguishing from a plain correct answer: they were shown
             the bait and did not take it, which is the whole definition of
             immunity to this trap. */
          detail: `Answered correctly with the ${concept} bait on the page.`,
        },
      ];
    }

    /* Wrong, but not caught by the trap. Real evidence about the topic, and
       weaker evidence than the bait case, so it is filed as such rather than
       inflating the trap's recurrence count with an unrelated error. */
    return q.topic
      ? [
          {
            subject,
            concept: q.topic,
            summary: `Missed a question on ${q.topic}`,
            severity: "moderate",
            tool: "exam-detective",
            sourceId: context.sprintId,
            kind: "evidence",
            detail: `Answered incorrectly, though not by falling for the ${concept} trap.`,
          },
        ]
      : [];
  });

  return prepareCandidates(out);
}
