import { useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/auth";
import { useOptionalTimer } from "../context/timer";
import { appendLocalSession } from "../lib/localSessions";
import {
  creditedMsFromDurations,
  creditedMsFromMarks,
  toLoggableMinutes,
} from "../lib/studyClock";
import { useLogSession } from "./useSessions";

/* Credits a study activity with the time it actually took.
 *
 * Until now the focus timer was the only thing that wrote a StudySession, so a
 * 20-minute review contributed nothing to streaks, the daily-goal rings, plan
 * adherence, or the friends leaderboard — the app was under-crediting exactly
 * the work it most wants to encourage.
 *
 * Call `mark()` at the start of the session and again after each unit of work;
 * call `commit()` once when it ends. Activities that already time their own
 * units (the quiz runner stamps `secondsSpent` per answer) skip `mark()`
 * entirely and pass those durations to `commit()`.
 *
 * Minutes are capped per-gap by lib/studyClock — see the reasoning there. */

export type StudyClockType = "review" | "quiz";

export interface UseStudyClockOptions {
  /** Recorded as `timer_type`, keeping these distinguishable from the
   *  timer's own "pomodoro"/"countdown" rows. */
  timerType: StudyClockType;
  task: string;
  folderId: string | null;
}

export interface StudyClock {
  mark: () => void;
  /** Idempotent. Pass pre-measured durations to credit those instead of the marks. */
  commit: (durationsMs?: number[]) => void;
}

export function useStudyClock({
  timerType,
  task,
  folderId,
}: UseStudyClockOptions): StudyClock {
  const { session } = useAuth();
  const timer = useOptionalTimer();
  const { mutate: logMinutes } = useLogSession();

  const marksRef = useRef<number[]>([]);
  const suppressedRef = useRef(false);
  const committedRef = useRef(false);

  /* Sampled into a ref during render so the callbacks below stay stable —
     the same trick TimerProvider uses for its effects. `useOptionalTimer`
     rather than `useTimer`: this must not require a TimerProvider above it,
     which keeps the call sites renderable in isolation under test. */
  const timerCoveringRef = useRef(false);
  timerCoveringRef.current = Boolean(
    timer?.state.isRunning && timer.state.mode === "Focus",
  );

  /* A running focus timer already logs this wall clock when its phase ends.
   * Latched on *any* mark rather than sampled at commit: a timer started
   * halfway through a review still suppresses the whole session. That
   * under-credits an edge case, which is the right way to be wrong when the
   * number feeds a leaderboard other students can see. */
  const latchSuppression = () => {
    if (timerCoveringRef.current) suppressedRef.current = true;
  };

  const mark = useCallback(() => {
    if (committedRef.current) return;
    latchSuppression();
    marksRef.current.push(Date.now());
  }, []);

  const commit = useCallback(
    (durationsMs?: number[]) => {
      if (committedRef.current) return;
      committedRef.current = true;
      latchSuppression();
      if (suppressedRef.current) return;

      const ms = durationsMs
        ? creditedMsFromDurations(durationsMs)
        : creditedMsFromMarks(marksRef.current);
      const minutes = toLoggableMinutes(ms);
      if (minutes === null) return;

      /* Local history first and synchronously, mirroring the timer: a flaky
         connection must not make a just-finished session vanish from view. */
      appendLocalSession({
        minutes,
        task,
        folderId,
        timerType,
        isGuest: !session,
      });

      /* Guests keep the local copy only; guestSessionMigration replays it on
         signup. No toast — unlike the timer's one-off signup prompt, nagging
         after every review would just be noise. */
      if (!session) return;

      logMinutes(
        { minutes, task, folderId, timerType },
        {
          /* useLogSession already queues connectivity failures for replay, so
             what reaches here is an authoritative rejection. The local copy
             survives either way, and a student who just finished studying
             should not be shown an error about bookkeeping. */
          onError: (err) =>
            console.warn(
              "[studyClock] Supabase session log failed (local copy preserved):",
              err,
            ),
        },
      );
    },
    [folderId, logMinutes, session, task, timerType],
  );

  /* Stable identity: `scoreCard` in ReviewView lists this in its dependency
     array, and a fresh object each render would re-fire the effect that
     registers the flashcard grader with the chat panel. */
  return useMemo(() => ({ mark, commit }), [mark, commit]);
}
