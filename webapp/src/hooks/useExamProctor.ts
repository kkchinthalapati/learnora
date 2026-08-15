import { useEffect, useRef, useState } from "react";

const GRACE_PERIOD_MS = 5000; // 5 seconds

export interface UseExamProctorOptions {
  /** Whether the exam is currently in progress (not finished). */
  isActive: boolean;
  /** Whether grace period is enabled (from settings.examTerminationGrace). */
  enabled?: boolean;
  /** Called when the grace period expires or is skipped. */
  onTerminate: (reason: "fullscreen" | "visibility") => void;
}

export interface UseExamProctorResult {
  /** Countdown in milliseconds (null if no grace period active). */
  graceCountdown: number | null;
  /** Reason for the current grace period, or null. */
  graceReason: "fullscreen" | "visibility" | null;
}

/**
 * Proctoring guard for mock exams: watch for tab switches and fullscreen exits,
 * show a countdown warning, then terminate if the student doesn't return.
 *
 * Models useTimerIntervention but for exam termination instead of pause.
 * Can be disabled via settings.examTerminationGrace for stricter enforcement.
 */
export function useExamProctor(
  options: UseExamProctorOptions,
): UseExamProctorResult {
  const { isActive, enabled = true, onTerminate } = options;
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);
  const [graceReason, setGraceReason] = useState<
    "fullscreen" | "visibility" | null
  >(null);
  const terminateTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  /* Mirrors graceReason for the handlers below to read synchronously.
   * graceReason itself can't be in this effect's dependency array: it's
   * *set* by handlers this same effect defines, so listing it would make
   * every grace-period start immediately re-run the effect — cleanup
   * clears the terminateTimeout/countdownInterval that startGracePeriod
   * had just scheduled, so onTerminate would never fire. */
  const graceReasonRef = useRef<"fullscreen" | "visibility" | null>(null);
  /* Same "latest ref" treatment for onTerminate: MockExamRunner passes an
   * inline `() => submitExam("terminated")`, a fresh function identity on
   * every render — every answer picked, every tick of the exam's own
   * clock. If onTerminate stayed in the effect's deps, each of those
   * re-renders would tear down and reschedule the grace-period timers
   * mid-countdown, so a student could tab away indefinitely and never
   * actually get auto-submitted. */
  const onTerminateRef = useRef(onTerminate);
  useEffect(() => {
    onTerminateRef.current = onTerminate;
  }, [onTerminate]);

  useEffect(() => {
    if (!isActive || !enabled) {
      graceReasonRef.current = null;
      setGraceCountdown(null);
      setGraceReason(null);
      return;
    }

    const startGracePeriod = (reason: "fullscreen" | "visibility") => {
      graceReasonRef.current = reason;
      setGraceCountdown(GRACE_PERIOD_MS);
      setGraceReason(reason);
      startTimeRef.current = Date.now();

      /* Update countdown every 100ms */
      countdownIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current === null) return;
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = Math.max(0, GRACE_PERIOD_MS - elapsed);
        setGraceCountdown(remaining);

        if (remaining <= 0) {
          /* Grace period expired, terminate now */
          if (countdownIntervalRef.current !== null) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          graceReasonRef.current = null;
          setGraceReason(null);
          onTerminateRef.current(reason);
        }
      }, 100);

      /* Fallback: terminate after GRACE_PERIOD_MS if interval doesn't fire */
      terminateTimeoutRef.current = window.setTimeout(() => {
        graceReasonRef.current = null;
        setGraceCountdown(null);
        setGraceReason(null);
        onTerminateRef.current(reason);
      }, GRACE_PERIOD_MS);
    };

    const handleFullscreenChange = () => {
      /* Exited fullscreen while active */
      if (!document.fullscreenElement && graceReasonRef.current === null) {
        startGracePeriod("fullscreen");
      } else if (
        document.fullscreenElement &&
        graceReasonRef.current === "fullscreen"
      ) {
        /* Re-entered fullscreen, cancel grace period */
        if (terminateTimeoutRef.current !== null) {
          clearTimeout(terminateTimeoutRef.current);
          terminateTimeoutRef.current = null;
        }
        if (countdownIntervalRef.current !== null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        graceReasonRef.current = null;
        setGraceCountdown(null);
        setGraceReason(null);
      }
    };

    const handleVisibilityChange = () => {
      /* Tab hidden while active */
      if (document.hidden && graceReasonRef.current === null) {
        startGracePeriod("visibility");
      } else if (!document.hidden && graceReasonRef.current === "visibility") {
        /* Tab became visible, cancel grace period */
        if (terminateTimeoutRef.current !== null) {
          clearTimeout(terminateTimeoutRef.current);
          terminateTimeoutRef.current = null;
        }
        if (countdownIntervalRef.current !== null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        graceReasonRef.current = null;
        setGraceCountdown(null);
        setGraceReason(null);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (terminateTimeoutRef.current !== null) {
        clearTimeout(terminateTimeoutRef.current);
      }
      if (countdownIntervalRef.current !== null) {
        clearInterval(countdownIntervalRef.current);
      }
    };
    /* graceReason and onTerminate deliberately excluded — see
       graceReasonRef/onTerminateRef above. */
  }, [isActive, enabled]);

  return { graceCountdown, graceReason };
}
