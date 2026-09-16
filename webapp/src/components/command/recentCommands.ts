import { Storage } from "../../lib/storage";

/** Ids of the last few commands the student ran, newest first. Kept in
 *  localStorage so a re-run of yesterday's command is one keystroke away
 *  instead of a scroll through the whole list. Prefix actions (t:, ai:,
 *  debug:) are deliberately excluded: they carry the typed text, so replaying
 *  them from a list would make no sense. */
export const RECENT_COMMANDS_KEY = "learnora_recent_commands";
export const RECENT_COMMANDS_LIMIT = 5;
export const RECENT_CATEGORY = "Recent";

export function readRecentCommandIds(): string[] {
  const raw = Storage.get<unknown>(RECENT_COMMANDS_KEY, []);
  return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
}

export function rememberCommandId(id: string): string[] {
  const next = [id, ...readRecentCommandIds().filter((x) => x !== id)].slice(
    0,
    RECENT_COMMANDS_LIMIT,
  );
  Storage.set(RECENT_COMMANDS_KEY, next);
  return next;
}
