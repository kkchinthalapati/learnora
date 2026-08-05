import { useEffect, useRef } from "react";
import type { AiPersona } from "../lib/settings";

const MESSAGES: Record<AiPersona, string[]> = {
  tutor: [
    "Hey! I noticed you stepped away. Let's get back to focusing!",
    "Taking a break? Make sure it's an intentional one.",
    "Your timer is still running! Let's finish strong.",
  ],
  coach: [
    "You said you wanted to study. Staring at another tab won't get you there.",
    "Get back to work! Your exam isn't going to pass itself.",
    "Focus! Distractions are the enemy of progress.",
  ],
  buddy: [
    "Did you get lost on YouTube? Come back!",
    "Hey friend, the timer is still ticking. You got this!",
    "Taking a quick detour? Let's get back on track.",
  ],
  professor: [
    "I must remind you that academic success requires sustained attention.",
    "Your focus session has been interrupted. Please return to your materials.",
    "Consistent study is paramount. Let us resume.",
  ],
};

export function useTimerIntervention(
  isRunning: boolean,
  persona: AiPersona,
  showToast: (msg: string, opts?: { error?: boolean }) => void,
  pause: () => void,
) {
  const toastTimeoutRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRunning) {
        // 15 seconds: Warning toast
        toastTimeoutRef.current = window.setTimeout(() => {
          const messages = MESSAGES[persona] || MESSAGES.tutor;
          const msg = messages[Math.floor(Math.random() * messages.length)];
          if (msg) {
             showToast(msg, { error: true });
          }
        }, 15000);

        // 60 seconds: Auto-pause timer to prevent fake studying
        pauseTimeoutRef.current = window.setTimeout(() => {
          pause();
          showToast("Timer auto-paused due to inactivity.", { error: true });
        }, 60000);

      } else {
        // Came back: Clear timeouts
        if (toastTimeoutRef.current !== null) {
          window.clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = null;
        }
        if (pauseTimeoutRef.current !== null) {
          window.clearTimeout(pauseTimeoutRef.current);
          pauseTimeoutRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    if (!isRunning) {
        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = null;
        }
        if (pauseTimeoutRef.current !== null) {
            window.clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
      if (pauseTimeoutRef.current !== null) window.clearTimeout(pauseTimeoutRef.current);
    };
  }, [isRunning, persona, showToast, pause]);
}
