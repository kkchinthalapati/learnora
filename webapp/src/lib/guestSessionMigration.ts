import { supabase } from "./supabase";
import { Storage } from "./storage";

const LOCAL_SESSIONS_KEY = "sessions";
const IMPORT_BATCH_SIZE = 100;

interface GuestSessionRecord {
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

const migrations = new Map<string, Promise<number>>();

function pendingGuestSessions(): GuestSessionRecord[] {
  const sessions = Storage.get<GuestSessionRecord[]>(LOCAL_SESSIONS_KEY, []);
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(
    (item) =>
      item.guest === true &&
      typeof item.guestSessionId === "string" &&
      item.guestSessionId.length > 0 &&
      typeof item.startedAt === "string" &&
      Number.isFinite(item.minutes) &&
      item.minutes > 0,
  );
}

function markImported(ids: Set<string>): void {
  const sessions = Storage.get<GuestSessionRecord[]>(LOCAL_SESSIONS_KEY, []);
  if (!Array.isArray(sessions)) return;
  Storage.set(
    LOCAL_SESSIONS_KEY,
    sessions.map((item) =>
      item.guestSessionId && ids.has(item.guestSessionId)
        ? { ...item, guest: false }
        : item,
    ),
  );
}

async function runMigration(userId: string): Promise<number> {
  const pending = pendingGuestSessions();
  if (pending.length === 0) return 0;

  const ids = pending.map((item) => item.guestSessionId!);
  const { data: existing, error: lookupError } = await supabase
    .from("study_sessions")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  if (lookupError) throw new Error(lookupError.message);

  const existingIds = new Set(
    (existing ?? []).map((row) => String((row as { id: unknown }).id)),
  );
  const missing = pending.filter(
    (item) => !existingIds.has(item.guestSessionId!),
  );

  for (let start = 0; start < missing.length; start += IMPORT_BATCH_SIZE) {
    const batch = missing.slice(start, start + IMPORT_BATCH_SIZE);
    const { error } = await supabase.from("study_sessions").insert(
      batch.map((item) => ({
        id: item.guestSessionId,
        user_id: userId,
        task: item.task || null,
        folder_id: item.folderId ?? null,
        minutes: item.minutes,
        timer_type: item.timerType ?? null,
        started_at: item.startedAt,
      })),
    );
    if (error) throw new Error(error.message);
  }

  markImported(new Set(ids));
  return missing.length;
}

/** Imports timer sessions completed before authentication exactly once.
 *
 * The UUID generated when the guest timer finishes becomes the database row
 * id. Looking those ids up before insertion makes retries safe if a previous
 * import reached Supabase but the browser closed before local storage could be
 * marked. Calls from the auth mutation and AuthProvider share one in-flight
 * promise, because Supabase may notify both during the same sign-in.
 */
export function migrateGuestSessions(userId: string): Promise<number> {
  const running = migrations.get(userId);
  if (running) return running;
  const migration = runMigration(userId).finally(() =>
    migrations.delete(userId),
  );
  migrations.set(userId, migration);
  return migration;
}

/** Mutation-hook entry point for login/signup; AuthProvider remains the
 * authoritative fallback for restored sessions and email-confirmation login.
 */
export async function migrateGuestSessionsForCurrentUser(): Promise<number> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user.id) return 0;
  return migrateGuestSessions(data.session.user.id);
}
