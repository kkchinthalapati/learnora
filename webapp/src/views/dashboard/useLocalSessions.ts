import { useEffect, useState } from "react";
import { Storage } from "../../lib/storage";
import { SESSION_LOGGED_EVENT } from "../../context/TimerProvider";

/* Ports the "Recent focus sessions" list's data source: js/main.js's
 * renderDashboard() reads exclusively from `Storage.get("sessions", [])`,
 * never Supabase — the same key `TimerProvider` writes to first and
 * synchronously on every completed session (see its comment on why: a
 * flaky Supabase write should never make a just-finished session vanish
 * from view). */

const KEY = "sessions";

export interface LocalSessionEntry {
  id: number;
  timestamp: string;
  minutes: number;
  task: string;
}

function read(): LocalSessionEntry[] {
  const stored = Storage.get<LocalSessionEntry[]>(KEY, []);
  return Array.isArray(stored) ? stored : [];
}

/** Re-reads on `SESSION_LOGGED_EVENT`, which `TimerProvider` dispatches after
 *  every write — a running timer is mounted app-wide (MiniTimer), so a
 *  session can finish while the dashboard is the visible route, and a plain
 *  `storage` event never fires in the tab that made the write. */
export function useLocalSessions(): LocalSessionEntry[] {
  const [sessions, setSessions] = useState<LocalSessionEntry[]>(read);

  useEffect(() => {
    const refresh = () => setSessions(read());
    window.addEventListener(SESSION_LOGGED_EVENT, refresh);
    return () => window.removeEventListener(SESSION_LOGGED_EVENT, refresh);
  }, []);

  return sessions;
}
