/* How far a new account got through /welcome, kept so drop-off can be seen.
 *
 * Why it exists: on 2026-11-05, 3 of the 9 confirmed accounts since the
 * board-first first run had signed in and left /welcome without finishing or
 * skipping, and nothing said which screen they left on. There is no product-
 * events table, and adding one needs a migration a person has to apply, so the
 * trail lives on the account itself (`user_metadata.onboarding_trail`, beside
 * the `onboarding` answers) and is read with SQL — see the query in
 * WAITINGONLEDGER.md.
 *
 * It records the first time each screen was reached and how the student left
 * (if they did through a button). It never holds answers, topics typed or
 * scores: the step names and the board picked are enough to place a drop-off.
 * Writes are best-effort and in order; a failed one is simply lost. */

import { authApi } from "../api/auth";

export const ONBOARDING_TRAIL_KEY = "onboarding_trail";

/** Every screen of the first run, including the lesson's inner phases and its
 *  failure state, since a slow or failed AI call is a likely place to leave. */
export type TrailStep =
  | "board"
  | "check"
  | "starting"
  | "start"
  | "lesson_wait"
  | "lesson_error"
  | "lesson_hook"
  | "lesson_teach"
  | "lesson_check"
  | "win";

/** How they left /welcome through the screen itself. No exit = they closed
 *  the tab or navigated away, which is the drop-off being measured. */
export type TrailExit = "practice" | "plan" | "notes" | "profile" | "skip";

export interface OnboardingTrail {
  v: 1;
  /** First time each step was reached (ISO). */
  steps: Partial<Record<TrailStep, string>>;
  /** The most recent step reached. */
  last: TrailStep | null;
  /** The board option picked on the first screen, by id. */
  board: string | null;
  exit: TrailExit | null;
  exitAt: string | null;
}

export const EMPTY_TRAIL: OnboardingTrail = {
  v: 1,
  steps: {},
  last: null,
  board: null,
  exit: null,
  exitAt: null,
};

/** Reaching a step: the first visit's time is kept, `last` always moves. */
export function reachStep(
  trail: OnboardingTrail,
  step: TrailStep,
  now: Date = new Date(),
): OnboardingTrail {
  return {
    ...trail,
    steps: trail.steps[step]
      ? trail.steps
      : { ...trail.steps, [step]: now.toISOString() },
    last: step,
  };
}

/** Leaving through a button. The first exit wins: "Set up all my subjects"
 *  finishes onboarding and then navigates, and that is one exit, not two. */
export function exitTrail(
  trail: OnboardingTrail,
  exit: TrailExit,
  now: Date = new Date(),
): OnboardingTrail {
  if (trail.exit) return trail;
  return { ...trail, exit, exitAt: now.toISOString() };
}

const STEP_NAMES: readonly TrailStep[] = [
  "board", "check", "starting", "start", "lesson_wait", "lesson_error",
  "lesson_hook", "lesson_teach", "lesson_check", "win",
];
const EXIT_NAMES: readonly TrailExit[] = ["practice", "plan", "notes", "profile", "skip"];

/** The trail already on the account, so a reload part-way through (which
 *  restarts the first run at the board) adds to it instead of wiping it.
 *  Anything malformed is dropped rather than trusted: user_metadata is
 *  writable by the user. */
export function readTrail(metadata: unknown): OnboardingTrail {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.[
    ONBOARDING_TRAIL_KEY
  ] as Partial<OnboardingTrail> | undefined;
  if (!raw || typeof raw !== "object" || raw.v !== 1) return EMPTY_TRAIL;
  const steps: OnboardingTrail["steps"] = {};
  for (const name of STEP_NAMES) {
    const at = raw.steps?.[name];
    if (typeof at === "string") steps[name] = at;
  }
  return {
    v: 1,
    steps,
    last: STEP_NAMES.includes(raw.last as TrailStep) ? (raw.last as TrailStep) : null,
    board: typeof raw.board === "string" ? raw.board : null,
    exit: EXIT_NAMES.includes(raw.exit as TrailExit) ? (raw.exit as TrailExit) : null,
    exitAt: typeof raw.exitAt === "string" ? raw.exitAt : null,
  };
}

/** Sends the whole trail each time, one write after another, so a slow early
 *  write can never land after — and overwrite — a later one. Supabase merges
 *  `data` into user_metadata key by key, so the `onboarding` answers written
 *  by the same screen are untouched. */
export function createTrailWriter(
  initial: OnboardingTrail = EMPTY_TRAIL,
  save: (data: Record<string, unknown>) => Promise<void> = (data) =>
    authApi.updateProfile(data),
) {
  let trail: OnboardingTrail = initial;
  let queue: Promise<void> = Promise.resolve();

  const write = (next: OnboardingTrail) => {
    if (next === trail) return queue;
    trail = next;
    const snapshot = next;
    queue = queue
      .then(() => save({ [ONBOARDING_TRAIL_KEY]: snapshot }))
      .catch(() => {
        /* Measurement only; never worth interrupting a first run over. */
      });
    return queue;
  };

  return {
    reach: (step: TrailStep) =>
      trail.last === step ? queue : write(reachStep(trail, step)),
    board: (id: string) =>
      trail.board === id ? queue : write({ ...trail, board: id }),
    exit: (exit: TrailExit) => write(exitTrail(trail, exit)),
    get current() {
      return trail;
    },
  };
}
