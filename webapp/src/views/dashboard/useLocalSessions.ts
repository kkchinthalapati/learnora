import { useEffect, useState } from "react";
import {
  SESSION_LOGGED_EVENT,
  readLocalSessions,
} from "../../lib/localSessions";

/* Ports the "Recent focus sessions" list's data source: js/main.js's
 * renderDashboard() reads exclusively from `Storage.get("sessions", [])`,
 * never Supabase — the same key `TimerProvider` writes to first and
 * synchronously on every completed session (see its comment on why: a
 * flaky Supabase write should never make a just-finished session vanish
 * from view). */

/** Re-reads on `SESSION_LOGGED_EVENT`, which `appendLocalSession` dispatches
 *  after every write — a running timer is mounted app-wide (FocusStudyHUD), so a
 *  session can finish while the dashboard is the visible route, and a plain
 *  `storage` event never fires in the tab that made the write. */
export function useLocalSessions() {
  const [sessions, setSessions] = useState(readLocalSessions);

  useEffect(() => {
    const refresh = () => setSessions(readLocalSessions());
    window.addEventListener(SESSION_LOGGED_EVENT, refresh);
    return () => window.removeEventListener(SESSION_LOGGED_EVENT, refresh);
  }, []);

  return sessions;
}
