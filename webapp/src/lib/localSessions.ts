import { Storage } from "./storage";

/* The local-first copy of a finished study session.
 *
 * The vanilla app stored sessions in localStorage first and wrote to Supabase
 * best-effort ("local history is the source of truth for instant UI"), and that
 * ordering is preserved: the local write is synchronous, so a flaky connection
 * never makes a just-finished session vanish from view.
 *
 * This lived inline in TimerProvider while the focus timer was the only thing
 * that logged sessions. Flashcard review and quiz runs credit time too now, so
 * the write moved here — otherwise those sessions would reach Supabase but be
 * missing from SessionHistoryCard, TimerView's recent list, and FocusCard's
 * guest/offline fallback, all of which read localStorage. */

export const LOCAL_SESSIONS_KEY = "sessions";
export const MAX_LOCAL_SESSIONS = 500;

/* Dispatched after every local write (js/timer.js:463) so the dashboard's
 * session log and "today" total repaint live even though whatever logged them
 * can be on a different route. A `storage` event won't do it: that only fires
 * in *other* tabs, never the one that made the write. */
export const SESSION_LOGGED_EVENT = "learnora:sessionLogged";

export interface LocalSession {
  id: number;
  timestamp: string;
  minutes: number;
  task: string;
  folderId?: string | null;
  timerType?: string | null;
  startedAt?: string;
  guestSessionId?: string;
  guest?: boolean;
}

export interface AppendLocalSessionInput {
  minutes: number;
  task: string;
  folderId: string | null;
  timerType: string | null;
  /** Guest sessions carry an id so `guestSessionMigration` can replay them
   *  into Supabase exactly once when the student signs up. */
  isGuest: boolean;
}

export function readLocalSessions(): LocalSession[] {
  const stored = Storage.get<LocalSession[]>(LOCAL_SESSIONS_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

export function appendLocalSession({
  minutes,
  task,
  folderId,
  timerType,
  isGuest,
}: AppendLocalSessionInput): void {
  const completedAt = Date.now();
  const sessions = readLocalSessions();

  sessions.unshift({
    id: completedAt,
    timestamp: new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    minutes,
    task,
    folderId,
    timerType,
    startedAt: new Date(completedAt - minutes * 60_000).toISOString(),
    guestSessionId: isGuest ? crypto.randomUUID() : undefined,
    guest: isGuest,
  });

  Storage.set(LOCAL_SESSIONS_KEY, sessions.slice(0, MAX_LOCAL_SESSIONS));
  /* After the write, never before: listeners re-read storage. */
  window.dispatchEvent(new Event(SESSION_LOGGED_EVENT));
}
