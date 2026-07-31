import { useEffect, useRef, useState } from "react";
import { AuthStatus, type AuthStatusState } from "./AuthShell";

/* The status banner's 6-second auto-hide (js/main.js:470-472), kept as its own
 * hook so each form just calls `setStatus(...)` and forgets about it.
 *
 * `useRef` for the timer, not state: restarting the countdown must not
 * re-render, and a status set twice in a row has to clear the first timeout or
 * the second message inherits whatever was left of the first one's.
 *
 * Its own module rather than living beside `AuthShell` so that file exports
 * only components — otherwise every edit to the hook invalidates the shell for
 * fast refresh. */

const STATUS_TIMEOUT_MS = 6000;

export function useAuthStatus() {
  const [status, setStatusState] = useState<AuthStatusState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function setStatus(next: AuthStatusState | null) {
    if (timer.current) clearTimeout(timer.current);
    setStatusState(next);
    if (next) {
      timer.current = setTimeout(() => setStatusState(null), STATUS_TIMEOUT_MS);
    }
  }

  return {
    status,
    setStatus,
    node: status ? <AuthStatus {...status} /> : null,
  };
}
