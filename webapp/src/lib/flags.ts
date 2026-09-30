/* Experimental switches for the 2026-09 redesign's A/B items.
 *
 * Each is on in development and off in production, and either can be forced
 * per browser from the console:
 *   localStorage.setItem("learnora:flag:weeklyGoal", "true")
 * There is no remote flag service; when one arrives, this is the one file
 * that reads it. */

import { Storage } from "./storage";

export const FLAGS = {
  /** Today's rail shows "4 study days this week, goal 5" instead of a daily
   *  streak. Streak/loss-aversion evidence is industry-grade, not peer
   *  reviewed, so this ships as an experiment. */
  weeklyGoal: "weeklyGoal",
  /** The Ask drawer asks for a guess before answering a conceptual question. */
  guessFirst: "guessFirst",
  /** Teach mode lists what the explanation skipped / covered as chips. */
  teachGapChips: "teachGapChips",
} as const;

export type FlagName = keyof typeof FLAGS;

const storageKey = (name: FlagName) => `learnora:flag:${name}`;

export function isFlagOn(
  name: FlagName,
  { dev = import.meta.env.DEV }: { dev?: boolean } = {},
): boolean {
  const forced = Storage.get<unknown>(storageKey(name), null);
  if (typeof forced === "boolean") return forced;
  return dev;
}
