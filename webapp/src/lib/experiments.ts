/* Experiments: deterministic assignment of a unit (a misconception, a
 * student) to an arm, so an effect can be measured rather than assumed.
 *
 * Rules (research/strategy-roadmap.md §4, Stage 4):
 *   - Never withhold help known to work. Arms vary the *format or timing*
 *     of support, not whether the student gets it.
 *   - Assignment is a hash of experiment id and unit id: stable across
 *     devices and sessions, no table, no network.
 *   - The arm travels with the observation it shaped (`experimentTag` in the
 *     ledger detail), so the analysis in docs/experiments.md reads it back
 *     from the data rather than recomputing the hash in SQL.
 *   - Decision rules are written in docs/experiments.md before any result
 *     is looked at.
 */

export interface Experiment<A extends string = string> {
  id: string;
  arms: readonly A[];
}

/** 4.2: does a longer gap before the first retest make a corrected belief
 *  stick better? Unit: one misconception row. Both arms get the full
 *  re-teach and contrast; only when the retest comes differs. */
export const RETEST_DELAY = {
  id: "retest-delay-v1",
  arms: ["2d", "4d"],
} as const satisfies Experiment;

/** Minimum days before the retest, per arm. */
export const RETEST_DELAY_DAYS: Record<(typeof RETEST_DELAY.arms)[number], number> = {
  "2d": 2,
  "4d": 4,
};

/** FNV-1a, 32-bit: small, fast, and well spread for short ids. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function armFor<A extends string>(experiment: Experiment<A>, unitId: string): A {
  return experiment.arms[fnv1a(`${experiment.id}:${unitId}`) % experiment.arms.length];
}

/** The tag appended to a ledger observation's detail: "[exp retest-delay-v1=4d]". */
export function experimentTag(experiment: Experiment, arm: string): string {
  return `[exp ${experiment.id}=${arm}]`;
}
