/* The placement check: where a student is in a specification, in at most a
 * dozen questions.
 *
 * Every topic used to start at the same unmeasured prior, so the first
 * sessions on a new exam were aimed at nothing in particular. The strongest
 * Indian evidence for adaptive learning came from teaching at the level a
 * student was measured at (Mindspark; research/deep-dives.md §4), and ALEKS
 * and Math Academy both open with a short adaptive check.
 *
 * How it chooses: each topic carries a belief that the student knows it.
 * The next question goes to the topic whose answer would tell us most —
 * most uncertain, with the most topics building on it, and the most marks.
 * An answer spreads along the syllabus's prerequisite links, discounted: a
 * right answer makes its prerequisites likelier known; a wrong answer, or
 * "I haven't learned this yet", makes what builds on it likelier unknown.
 *
 * No feedback is shown during the check (it is a measurement, not a lesson),
 * and the result is offered as a starting estimate, not a grade. The
 * answers themselves are recorded like any other (lib/attempts.ts), so the
 * knowledge model refines the picture from the first practice session on.
 *
 * Pure: selection and update are tested without a database. */

import { topicInTier, weightedTopics, type SyllabusSpec, type SyllabusTier } from "./syllabus";

export const PLACEMENT_MAX_QUESTIONS = 12;
/** Beliefs past these are settled; no more questions go to them. */
export const SETTLED_KNOWN = 0.8;
export const SETTLED_UNKNOWN = 0.2;
const PRIOR = 0.5;
const RIGHT = 0.9;
const WRONG = 0.1;
/** What a right answer lends each prerequisite, and a wrong one takes from
 *  each dependent: evidence by implication is weaker than evidence. */
const PREREQ_FLOOR = 0.75;
const DEPENDENT_CEILING = 0.3;

export type PlacementOutcome = "right" | "wrong" | "not-learned";

export interface PlacementState {
  belief: Record<string, number>;
  asked: { topicRef: string; outcome: PlacementOutcome }[];
}

export function startPlacement(spec: SyllabusSpec, tier: SyllabusTier): PlacementState {
  const belief: Record<string, number> = {};
  for (const t of spec.topics) if (topicInTier(t, tier)) belief[t.ref] = PRIOR;
  return { belief, asked: [] };
}

/** Topics that list `ref` as a prerequisite, transitively. */
function dependentsOf(spec: SyllabusSpec, ref: string): Set<string> {
  const out = new Set<string>();
  const stack = [ref];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of spec.topics) {
      if (t.prerequisites?.includes(cur) && !out.has(t.ref)) {
        out.add(t.ref);
        stack.push(t.ref);
      }
    }
  }
  return out;
}

/** Topics `ref` builds on, transitively. */
function prerequisitesOf(spec: SyllabusSpec, ref: string): Set<string> {
  const byRef = new Map(spec.topics.map((t) => [t.ref, t]));
  const out = new Set<string>();
  const stack = [ref];
  while (stack.length) {
    for (const p of byRef.get(stack.pop()!)?.prerequisites ?? []) {
      if (!out.has(p)) {
        out.add(p);
        stack.push(p);
      }
    }
  }
  return out;
}

function settled(b: number): boolean {
  return b >= SETTLED_KNOWN || b <= SETTLED_UNKNOWN;
}

/** The topic to ask about next, or null when the check is done. `available`
 *  limits the choice to topics the bank has an unused question for. */
export function nextPlacementTopic(
  spec: SyllabusSpec,
  tier: SyllabusTier,
  state: PlacementState,
  available: (ref: string) => boolean = () => true,
): string | null {
  if (state.asked.length >= PLACEMENT_MAX_QUESTIONS) return null;
  const weights = new Map(weightedTopics(spec, tier).map((t) => [t.ref, t.weightPercent]));
  let best: string | null = null;
  let bestScore = 0;
  const asked = new Set(state.asked.map((a) => a.topicRef));
  for (const [ref, b] of Object.entries(state.belief)) {
    if (settled(b) || asked.has(ref) || !available(ref)) continue;
    const uncertainty = 1 - Math.abs(2 * b - 1);
    const reach = 1 + dependentsOf(spec, ref).size + prerequisitesOf(spec, ref).size * 0.5;
    const score = uncertainty * reach * (1 + (weights.get(ref) ?? 0) / 10);
    if (score > bestScore + 1e-9) {
      best = ref;
      bestScore = score;
    }
  }
  return best;
}

/** The state after one answer. */
export function recordPlacement(
  spec: SyllabusSpec,
  state: PlacementState,
  topicRef: string,
  outcome: PlacementOutcome,
): PlacementState {
  const belief = { ...state.belief };
  /* An answer on a topic beats anything implied about it by another. */
  const direct = new Set([...state.asked.map((a) => a.topicRef), topicRef]);
  if (outcome === "right") {
    belief[topicRef] = RIGHT;
    for (const p of prerequisitesOf(spec, topicRef)) {
      if (p in belief && !direct.has(p)) belief[p] = Math.max(belief[p], PREREQ_FLOOR);
    }
  } else {
    belief[topicRef] = WRONG;
    for (const d of dependentsOf(spec, topicRef)) {
      if (d in belief && !direct.has(d)) belief[d] = Math.min(belief[d], DEPENDENT_CEILING);
    }
  }
  return { belief, asked: [...state.asked, { topicRef, outcome }] };
}

export interface PlacementResult {
  /** Likely known: start later. */
  known: string[];
  /** Likely gaps, foundations first: start here. */
  gaps: string[];
  /** Not settled either way. */
  unsure: string[];
}

/** Topic refs sorted into known / gaps / unsure; gaps in syllabus order
 *  with prerequisites before what builds on them. */
export function placementResult(spec: SyllabusSpec, state: PlacementState): PlacementResult {
  const order = spec.topics.map((t) => t.ref).filter((r) => r in state.belief);
  const known = order.filter((r) => state.belief[r] >= SETTLED_KNOWN);
  const unsure = order.filter((r) => !settled(state.belief[r]));
  const gapSet = new Set(order.filter((r) => state.belief[r] <= SETTLED_UNKNOWN));
  const gaps = [...gapSet].sort((a, b) => {
    const aFirst = prerequisitesOf(spec, b).has(a);
    const bFirst = prerequisitesOf(spec, a).has(b);
    if (aFirst !== bFirst) return aFirst ? -1 : 1;
    return order.indexOf(a) - order.indexOf(b);
  });
  return { known, gaps, unsure };
}
