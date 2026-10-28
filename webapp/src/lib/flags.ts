/* Experimental switches for the 2026-09 redesign's A/B items.
 *
 * Each is on in development and off in production (except those listed in
 * ON_BY_DEFAULT below, which are on everywhere), and either can be forced
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
  /** Tutor replies may carry OpenUI cards (callouts, worked examples, tables,
   *  flashcards, a check question) inside the Markdown. On by default; a card
   *  that cannot be fully drawn says so and the Markdown around it stays. */
  openUi: "openUi",
  /** Classes: a teacher's class misconception map, and a student's choice
   *  to share with it (lib/classMap.ts). Off in production until the privacy
   *  review in WAITINGONLEDGER.md 6.11; its migration isn't applied yet. */
  classMap: "classMap",
} as const;

export type FlagName = keyof typeof FLAGS;

/** Flags that have graduated: on everywhere unless a browser forces them off
 *  (`localStorage.setItem("learnora:flag:openUi", "false")`). */
const ON_BY_DEFAULT: ReadonlySet<FlagName> = new Set(["openUi"]);

const storageKey = (name: FlagName) => `learnora:flag:${name}`;

export function isFlagOn(
  name: FlagName,
  { dev = import.meta.env.DEV }: { dev?: boolean } = {},
): boolean {
  const forced = Storage.get<unknown>(storageKey(name), null);
  if (typeof forced === "boolean") return forced;
  return ON_BY_DEFAULT.has(name) || dev;
}
