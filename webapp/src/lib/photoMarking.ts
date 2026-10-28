/* Photo marking: a handwritten answer, marked against the student's own mark
 * scheme. Pure logic; api/aiMarkAnswer.ts asks the model, this decides what
 * its reply is allowed to mean.
 *
 * Marking is where an AI is most tempting to trust and least safe to: a
 * confident "4 of 5" from a model that misread the handwriting is worse
 * than no mark, because the student believes it. So:
 *
 * - The scheme is the student's (pasted from the paper they're practising).
 *   Points are numbered here, before the model sees them, and the score is
 *   counted here from the points. The model never reports a total.
 * - A point counts only when the model copies the words from the answer
 *   that earn it. "Awarded" with nothing quoted is not awarded.
 * - A point the reply doesn't mention is "not checked", never "missed".
 *   If any are unchecked, the score says so.
 * - Unreadable handwriting gets no score at all, only "take it again".
 * - Wrong beliefs go to the ledger only from the student's own quoted words,
 *   and only as provisional unless the catalogue recognises them. Missing a
 *   point is not a belief. */

import { detectFromExplanation } from "./misconceptionCatalogue";
import type { MisconceptionCandidate } from "./misconceptions";

export interface SchemePoint {
  /** The point as the scheme words it. */
  text: string;
  marks: number;
}

/** A scheme longer than this is a whole paper, not one question. */
export const MAX_SCHEME_POINTS = 20;
/** Beliefs filed from one answer, at most. */
export const MAX_BELIEFS = 3;

/* "(2)", "[2]", "[2 marks]", "2 marks", "(1 mark)" at the end of a line. */
const MARKS_SUFFIX = /\s*(?:[([]\s*(\d{1,2})\s*(?:marks?)?\s*[)\]]|(\d{1,2})\s*marks?)\s*$/i;
/* Column headers and furniture copied along with the scheme. */
const HEADER = /^(mark scheme|marking scheme|answers?|marks?|guidance|question|total|additional guidance|accept|ignore|do not accept)\s*:?\s*$/i;
const BULLET = /^\s*(?:[-*•·▪]|\d{1,2}[.)]|[a-z][.)]|\([a-z0-9]{1,3}\))\s+/i;

/**
 * Points from a pasted scheme, one per line. A trailing "(2)" or "[2 marks]"
 * sets a point's marks; otherwise it is worth one. Headers, blank lines and
 * bare totals are dropped.
 */
export function parseMarkScheme(raw: string): SchemePoint[] {
  const out: SchemePoint[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.replace(BULLET, "").trim();
    if (!line || HEADER.test(line)) continue;
    let marks = 1;
    const m = MARKS_SUFFIX.exec(line);
    if (m) {
      marks = Number(m[1] ?? m[2]);
      line = line.slice(0, m.index).trim();
    }
    /* A line that was only "[4 marks]" is the question's total, not a point. */
    if (!line || /^total\b/i.test(line)) continue;
    if (marks < 1 || marks > 10) marks = 1;
    out.push({ text: line, marks });
    if (out.length >= MAX_SCHEME_POINTS) break;
  }
  return out;
}

export function schemeTotal(points: readonly SchemePoint[]): number {
  return points.reduce((n, p) => n + p.marks, 0);
}

/* ── The model's reply ───────────────────────────────────────────────────── */

export interface RawMarking {
  legible?: unknown;
  unreadable?: unknown;
  points?: unknown;
  beliefs?: unknown;
}

export type PointVerdict = "awarded" | "missed" | "unchecked";

export interface MarkedPoint {
  point: SchemePoint;
  verdict: PointVerdict;
  /** The student's own words that earn it, copied by the model. */
  evidence: string;
  /** For a missed point: what was missing, in a few words. */
  note: string;
}

export interface Belief {
  concept: string;
  belief: string;
  quote: string;
}

export type Marking =
  | { kind: "unreadable"; reason: string }
  | {
      kind: "marked";
      points: MarkedPoint[];
      awarded: number;
      total: number;
      /** Points the reply didn't cover; the score is then a floor. */
      unchecked: number;
      beliefs: Belief[];
    };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** What a model reply may count for, against the scheme the student gave. */
export function readMarking(raw: RawMarking | null | undefined, scheme: readonly SchemePoint[]): Marking | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.legible === false) {
    return { kind: "unreadable", reason: str(raw.unreadable) };
  }
  const replies = Array.isArray(raw.points) ? raw.points : [];
  const byIndex = new Map<number, { awarded?: unknown; evidence?: unknown; note?: unknown }>();
  for (const r of replies) {
    if (!r || typeof r !== "object") continue;
    const i = Number((r as { index?: unknown }).index);
    if (Number.isInteger(i) && i >= 0 && i < scheme.length && !byIndex.has(i)) byIndex.set(i, r as never);
  }
  if (byIndex.size === 0) return null;

  const points: MarkedPoint[] = scheme.map((point, i) => {
    const r = byIndex.get(i);
    if (!r) return { point, verdict: "unchecked", evidence: "", note: "" };
    const evidence = str(r.evidence);
    const awarded = r.awarded === true && evidence.length > 0;
    return { point, verdict: awarded ? "awarded" : "missed", evidence: awarded ? evidence : "", note: str(r.note) };
  });

  const beliefs: Belief[] = (Array.isArray(raw.beliefs) ? raw.beliefs : [])
    .map((b) => ({
      concept: str((b as Belief | null)?.concept),
      belief: str((b as Belief | null)?.belief),
      quote: str((b as Belief | null)?.quote),
    }))
    .filter((b) => b.concept.length >= 3 && b.belief.length >= 8 && b.quote.length >= 3)
    .slice(0, MAX_BELIEFS);

  return {
    kind: "marked",
    points,
    awarded: points.filter((p) => p.verdict === "awarded").reduce((n, p) => n + p.point.marks, 0),
    total: schemeTotal(scheme),
    unchecked: points.filter((p) => p.verdict === "unchecked").length,
    beliefs,
  };
}

/**
 * Wrong beliefs in a marked answer → the ledger. The student's quoted words
 * are checked against the catalogue first: a match is filed as that named
 * belief, with its re-teach; anything else is the model's reading and is
 * filed provisional, which the loop never treats as a pattern until it is
 * seen twice (lib/mistakeLoop.ts `isNamedPattern`).
 */
export function candidatesFromMarking(
  marking: Marking,
  subject: string,
  runId: string,
): MisconceptionCandidate[] {
  if (marking.kind !== "marked" || !subject.trim()) return [];
  return marking.beliefs.map((b) => {
    const entry = detectFromExplanation(b.quote, `${b.concept} ${subject}`);
    const detail = `In a marked written answer: "${b.quote.slice(0, 200)}"`;
    return entry
      ? {
          subject: entry.subject,
          concept: entry.concept,
          summary: entry.belief,
          severity: "moderate" as const,
          tool: "quiz" as const,
          sourceId: `marked:${runId}`,
          kind: "evidence" as const,
          detail,
          catalogueId: entry.id,
          repairText: entry.remediation,
        }
      : {
          subject: subject.trim(),
          concept: b.concept,
          summary: b.belief,
          severity: "moderate" as const,
          tool: "quiz" as const,
          sourceId: `marked:${runId}`,
          kind: "evidence" as const,
          detail,
          provisional: true,
        };
  });
}
