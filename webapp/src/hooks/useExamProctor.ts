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
  const [graceReason, setGraceReason] = useState<"fullscreen" | "visibility" | null>(null);
  const onTerminateRef = useRef(onTerminate);
  onTerminateRef.current = onTerminate;

  const terminateTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const graceReasonRef = useRef<"fullscreen" | "visibility" | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (terminateTimeoutRef.current !== null) {
        window.clearTimeout(terminateTimeoutRef.current);
        terminateTimeoutRef.current = null;
      }
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      startTimeRef.current = null;
    };

    const cancelGracePeriod = () => {
      clearTimers();
      graceReasonRef.current = null;
      setGraceCountdown(null);
      setGraceReason(null);
    };

    if (!isActive || !enabled) {
      cancelGracePeriod();
      return;
    }

    const startGracePeriod = (reason: "fullscreen" | "visibility") => {
      if (graceReasonRef.current !== null) return;
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
          clearTimers();
          const finalReason = graceReasonRef.current || reason;
          graceReasonRef.current = null;
          setGraceReason(null);
          setGraceCountdown(null);
          onTerminateRef.current(finalReason);
        }
      }, 100);

      /* Fallback: terminate after GRACE_PERIOD_MS if interval doesn't fire */
      terminateTimeoutRef.current = window.setTimeout(() => {
        clearTimers();
        const finalReason = graceReasonRef.current || reason;
        graceReasonRef.current = null;
        setGraceCountdown(null);
        setGraceReason(null);
        onTerminateRef.current(finalReason);
      }, GRACE_PERIOD_MS);
    };

    const handleFullscreenChange = () => {
      /* Exited fullscreen while active */
      if (!document.fullscreenElement && graceReasonRef.current === null) {
        startGracePeriod("fullscreen");
      } else if (document.fullscreenElement && graceReasonRef.current === "fullscreen") {
        /* Re-entered fullscreen, cancel grace period */
        cancelGracePeriod();
      }
    };

    const handleVisibilityChange = () => {
      /* Tab hidden while active */
      if (document.hidden && graceReasonRef.current === null) {
        startGracePeriod("visibility");
      } else if (!document.hidden && graceReasonRef.current === "visibility") {
        /* Tab became visible, cancel grace period */
        cancelGracePeriod();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimers();
    };
  }, [isActive, enabled]);

  return { graceCountdown, graceReason };
}
