/* Hint-ladder state, per question attempt, kept on the device.
 *
 * Two stores:
 *   - the rung reached, keyed by attempt + question, so a refresh, a
 *     resumed quiz or a flaky connection lands on the same rung, and a retried
 *     click can't skip one ("advance" only ever moves up, to a stated rung);
 *   - the ladder text, keyed by question + level, so revisiting a question
 *     (or answering it offline after the first fetch) doesn't spend another
 *     AI call.
 * Both are bounded so a long-lived device doesn't grow them forever. */

import type { HintLadder, HintRung } from "./tutorPolicy";

const RUNG_KEY = "learnora_hint_rungs_v1";
const LADDER_KEY = "learnora_hint_ladders_v1";
const MAX_RUNGS = 400;
const MAX_LADDERS = 200;

type Stamped<T> = T & { at: number };

function read<T>(key: string): Record<string, Stamped<T>> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write<T>(key: string, value: Record<string, Stamped<T>>, max: number): void {
  const entries = Object.entries(value);
  const kept =
    entries.length > max ? Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, max)) : value;
  try {
    localStorage.setItem(key, JSON.stringify(kept));
  } catch {
    /* Storage full or blocked: the ladder still works for this page view. */
  }
}

const rungId = (attemptKey: string, questionKey: string) => `${attemptKey}:${questionKey}`;

export function getRung(attemptKey: string, questionKey: string): HintRung {
  const r = read<{ rung: HintRung }>(RUNG_KEY)[rungId(attemptKey, questionKey)]?.rung;
  return r === 1 || r === 2 || r === 3 ? r : 0;
}

/** Move to `to`, never down. Returns the rung now held. Calling it twice with
 *  the same target is a no-op, which is what makes a retried click safe. */
export function advanceRung(attemptKey: string, questionKey: string, to: HintRung): HintRung {
  const all = read<{ rung: HintRung }>(RUNG_KEY);
  const id = rungId(attemptKey, questionKey);
  const now = Math.max(all[id]?.rung ?? 0, to) as HintRung;
  all[id] = { rung: now, at: Date.now() };
  write(RUNG_KEY, all, MAX_RUNGS);
  return now;
}

const ladderId = (questionKey: string, level: string | null | undefined) => `${questionKey}|${(level ?? "").toLowerCase()}`;

export function cachedLadder(questionKey: string, level?: string | null): HintLadder | null {
  const hit = read<{ ladder: HintLadder }>(LADDER_KEY)[ladderId(questionKey, level)];
  return hit?.ladder ?? null;
}

export function cacheLadder(questionKey: string, level: string | null | undefined, ladder: HintLadder): void {
  const all = read<{ ladder: HintLadder }>(LADDER_KEY);
  all[ladderId(questionKey, level)] = { ladder, at: Date.now() };
  write(LADDER_KEY, all, MAX_LADDERS);
}
