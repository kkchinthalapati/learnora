/* Confusion pairs — pure logic.
 *
 * Students rarely fail an idea in isolation. They fail it by mistaking it for
 * the idea next to it: respiration for breathing, mass for weight, series for
 * parallel. The ledger already records each wrong belief as its own row, but
 * a row about "mass and weight" and a row about "respiration" look alike in
 * a list. This module reads the ledger for the *pair*, and decides when the
 * pair is worth drilling side by side, which is a different skill from
 * learning either half (interleaved discrimination practice).
 *
 * Two honesty rules decide what the app may say:
 * - "named": a row's own belief is the confusion (its catalogue entry is tied
 *   to the pair, or the row names both terms). Only then does the app say
 *   "you've mixed these up".
 * - "both": two separate rows each touch one side. That is only "you've slipped
 *   on both", and the app says exactly that.
 *
 * Kept free of React and Supabase, like the ledger's own logic. */

import type { Misconception } from "./misconceptions";
import {
  CONFUSABLE_PAIRS,
  type ConfusablePair,
  type PairSideKey,
  type PairStatement,
} from "./confusionPairData";
import { Storage } from "./storage";

export type PairKind = "named" | "both";

export interface ActivePair {
  pair: ConfusablePair;
  kind: PairKind;
  /** The open rows behind it. */
  rows: Misconception[];
  /** Times those rows have been observed, summed: how much evidence. */
  observed: number;
  lastSeenAt: string;
}

/** /tell-apart/:pairId */
export function tellApartHref(pairId: string): string {
  return `/tell-apart/${encodeURIComponent(pairId)}`;
}

/* ── Matching ledger rows to pairs ───────────────────────────────────────── */

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function hasCue(haystack: string, cues: readonly string[]): boolean {
  return cues.some((c) => haystack.includes(` ${c} `));
}

function subjectMatches(pair: ConfusablePair, subject: string): boolean {
  const s = subject.trim().toLowerCase();
  if (!s) return false;
  if (pair.subject === "Mathematics") return s.startsWith("math");
  return s.includes(pair.subject.toLowerCase());
}

/** A row the ledger would treat as a real pattern: not a provisional AI
 *  label seen once (lib/mistakeLoop.ts `isNamedPattern`, repeated here to keep
 *  this module free of that import cycle). */
function isOpenNamed(m: Misconception): boolean {
  return m.status !== "resolved" && (!m.provisional || m.timesObserved >= 2);
}

interface RowFit {
  a: boolean;
  b: boolean;
  tied: boolean;
}

function fit(pair: ConfusablePair, m: Misconception): RowFit | null {
  if (!subjectMatches(pair, m.subject)) return null;
  const text = normalise(`${m.concept} ${m.summary}`);
  const a = hasCue(text, pair.a.cues);
  const b = hasCue(text, pair.b.cues);
  const tied = !!m.catalogueId && pair.catalogueIds.includes(m.catalogueId);
  return a || b || tied ? { a, b, tied } : null;
}

/**
 * The pairs this student's open ledger rows put in play, strongest first:
 * named confusions before "slipped on both", then by how much evidence there
 * is, then by recency.
 */
export function activePairs(ledger: readonly Misconception[]): ActivePair[] {
  const open = ledger.filter(isOpenNamed);
  if (open.length === 0) return [];
  const out: ActivePair[] = [];
  for (const pair of CONFUSABLE_PAIRS) {
    const named: Misconception[] = [];
    const sideA: Misconception[] = [];
    const sideB: Misconception[] = [];
    for (const m of open) {
      const f = fit(pair, m);
      if (!f) continue;
      if (f.tied || (f.a && f.b)) named.push(m);
      else if (f.a) sideA.push(m);
      else if (f.b) sideB.push(m);
    }
    const rows = named.length > 0 ? named : sideA.length > 0 && sideB.length > 0 ? [...sideA, ...sideB] : [];
    if (rows.length === 0) continue;
    out.push({
      pair,
      kind: named.length > 0 ? "named" : "both",
      rows,
      observed: rows.reduce((n, m) => n + m.timesObserved, 0),
      lastSeenAt: rows.reduce((latest, m) => (m.lastSeenAt > latest ? m.lastSeenAt : latest), rows[0].lastSeenAt),
    });
  }
  return out.sort(
    (x, y) =>
      Number(y.kind === "named") - Number(x.kind === "named") ||
      y.observed - x.observed ||
      y.lastSeenAt.localeCompare(x.lastSeenAt),
  );
}

/** The named confusion a single row belongs to, for the ledger card and the
 *  check-back. Null when the row isn't one of a pair. */
export function namedPairForRow(ledger: readonly Misconception[], row: Misconception): ActivePair | null {
  return activePairs(ledger).find((p) => p.kind === "named" && p.rows.some((r) => r.id === row.id)) ?? null;
}

/** Pairs a piece of text is about, from the terms on either side, among the
 *  ones this student has in play. For a note's title and headings. */
export function pairsMentionedIn(active: readonly ActivePair[], text: string): ActivePair[] {
  const haystack = normalise(text);
  return active.filter((p) => hasCue(haystack, p.pair.a.cues) || hasCue(haystack, p.pair.b.cues));
}

/* ── When a pair is due ──────────────────────────────────────────────────── */

export interface PairResult {
  /** ISO time of the last drill. */
  at: string;
  correct: number;
  total: number;
}

export type PairState = Record<string, PairResult>;

const STATE_KEY = "learnora_tell_apart_v1";

/** A weak result comes back soon; a good one can wait. Days. */
export const WEAK_GAP_DAYS = 2;
export const GOOD_GAP_DAYS = 7;
/** Missing at most this many of a drill's statements counts as good. */
export const GOOD_MAX_MISSES = 1;

export function loadPairState(): PairState {
  const raw = Storage.get<unknown>(STATE_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PairState = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as Partial<PairResult> | null;
    if (r && typeof r.at === "string" && typeof r.correct === "number" && typeof r.total === "number") {
      out[id] = { at: r.at, correct: r.correct, total: r.total };
    }
  }
  return out;
}

export function savePairResult(pairId: string, correct: number, total: number, now: Date = new Date()): PairState {
  const next = { ...loadPairState(), [pairId]: { at: now.toISOString(), correct, total } };
  Storage.set(STATE_KEY, next);
  return next;
}

export function isPairDue(pairId: string, state: PairState, now: Date): boolean {
  const last = state[pairId];
  if (!last) return true;
  const gap = last.total - last.correct <= GOOD_MAX_MISSES ? GOOD_GAP_DAYS : WEAK_GAP_DAYS;
  return now.getTime() - new Date(last.at).getTime() >= gap * 86_400_000;
}

/** The one pair Home should offer today: the strongest that is due. */
export function nextDuePair(active: readonly ActivePair[], state: PairState, now: Date): ActivePair | null {
  return active.find((p) => isPairDue(p.pair.id, state, now)) ?? null;
}

/* ── The drill ───────────────────────────────────────────────────────────── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pair's statements in a shuffled order, never more than two from the
 *  same side in a row: the point is to make the student decide each time, not
 *  to let them spot a pattern. A seed makes the order repeatable. */
export function drillOrder(pair: ConfusablePair, seed: number): PairStatement[] {
  const rand = mulberry32(seed);
  const pool = [...pair.statements];
  for (let attempt = 0; attempt < 50; attempt++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const runs = pool.every((s, i) => i < 2 || !(s.side === pool[i - 1].side && s.side === pool[i - 2].side));
    if (runs) break;
  }
  return pool;
}

export interface DrillAnswer {
  statement: PairStatement;
  picked: PairSideKey;
}

export function isRight(a: DrillAnswer): boolean {
  return a.picked === a.statement.side;
}

export function misses(answers: readonly DrillAnswer[]): DrillAnswer[] {
  return answers.filter((a) => !isRight(a));
}

/** What a finished drill may write to the ledger rows behind a named pair.
 *  Two or more misses is the confusion happening again (evidence). No misses
 *  is the student telling them apart (a correction with no question behind
 *  it, so the loop moves a row to "improving" at most: only a check-back on
 *  a new question can mark it fixed). One miss alone is a slip and writes
 *  nothing. */
export function ledgerOutcome(answers: readonly DrillAnswer[]): "evidence" | "correction" | "none" {
  const missed = misses(answers).length;
  if (answers.length === 0) return "none";
  if (missed >= 2) return "evidence";
  if (missed === 0) return "correction";
  return "none";
}

/* ── Where the ledger's prompts learn about pairs ────────────────────────── */

/** Named confusions only, as a block for any AI prompt that already carries
 *  the ledger. The "both" kind is not a claim the app can stand behind, so
 *  it is not fed to a model as one. */
export function confusionPromptBlock(ledger: readonly Misconception[]): string {
  const named = activePairs(ledger).filter((p) => p.kind === "named");
  if (named.length === 0) return "";
  const lines = ["CONFUSED PAIRS (ideas this student has mixed up with each other):"];
  for (const { pair, observed } of named.slice(0, 3)) {
    lines.push(
      `  · ${pair.a.term} and ${pair.b.term} (${observed} sighting${observed === 1 ? "" : "s"}): ${pair.difference}`,
    );
  }
  lines.push(
    "- USE RULE: whenever either idea comes up, say in one sentence how it differs from the other, and when you ask a question make the student choose between them.",
    "- HONESTY RULE: do not announce that they confuse these; just contrast them.",
  );
  return lines.join("\n");
}

/** For quiz generation: a request for questions that put the pair side by
 *  side, built on the same named confusions. */
export function confusionQuizFocus(ledger: readonly Misconception[]): string {
  const named = activePairs(ledger).filter((p) => p.kind === "named");
  if (named.length === 0) return "";
  return `CONFUSED PAIRS the student has mixed up:
${named
  .slice(0, 3)
  .map(({ pair }) => `- ${pair.a.term} vs ${pair.b.term}: ${pair.difference}`)
  .join("\n")}
- Where one of these pairs is genuinely relevant to the material above, build a question whose most tempting WRONG option is the other idea of the pair. Do not name the pair or call it a weakness anywhere in the question or feedback. If none is relevant, ignore them entirely.`;
}
