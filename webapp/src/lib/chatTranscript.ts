/* Persistence for the AI chat transcript.
 *
 * Why this exists: the panel's messages lived in React state and nothing
 * else, so a refresh deleted the conversation. A student who reloads
 * mid-revision loses every explanation they just worked through, and the
 * tutor loses the thread it was following — notebook chats are already
 * persisted to a table, so the app was inconsistent with itself.
 *
 * Local rather than server-side, deliberately. This is a continuity
 * convenience, not a record: it has to survive a reload on the machine the
 * student is sitting at, and nothing here is worth a round trip or a
 * migration. If a transcript ever needs to follow them between devices it
 * belongs in a table, like `notebook_messages`.
 *
 * Two properties matter more than the storage choice:
 *
 *   Keyed by account. A shared laptop must never show one student's
 *   conversation to the next one who signs in, so the key carries the user
 *   id and a transcript is only ever read back for the account that wrote
 *   it.
 *
 *   Never throws. Private windows, blocked site data and full quotas all
 *   make localStorage fail, and a chat panel that cannot open because a
 *   save failed is worse than one that forgets.
 */

import type { ChatMessage } from "../context/chat";

export interface HistoryEntry {
  role: string;
  content: string;
}

export interface StoredTranscript {
  messages: ChatMessage[];
  /** The model-facing transcript, so a follow-up after a reload still has
   *  the thread rather than starting cold on the same screen. */
  history: HistoryEntry[];
}

const PREFIX = "learnora:chat_transcript:";

/** Enough to scroll back through a revision session, not so much that a long
 *  conversation grows the storage quota without bound. Trimmed from the
 *  front, because the newest turns are the ones being read. */
export const MAX_STORED_MESSAGES = 40;
export const MAX_STORED_HISTORY = 20;

function keyFor(userId: string): string {
  return `${PREFIX}${userId}`;
}

/** A message worth restoring. A pending one would come back as a bubble
 *  spinning forever on a request that died with the old page. */
function isRestorable(message: ChatMessage): boolean {
  return Boolean(message) && message.pending !== true;
}

export function loadTranscript(userId: string | null | undefined): StoredTranscript {
  const empty: StoredTranscript = { messages: [], history: [] };
  if (!userId || typeof window === "undefined" || !window.localStorage) return empty;

  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredTranscript>;
    if (!parsed || typeof parsed !== "object") return empty;

    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(
          (m): m is ChatMessage =>
            Boolean(m) &&
            typeof (m as ChatMessage).id === "string" &&
            typeof (m as ChatMessage).text === "string" &&
            ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "ai") &&
            isRestorable(m as ChatMessage),
        )
      : [];

    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(
          (h): h is HistoryEntry =>
            Boolean(h) &&
            typeof (h as HistoryEntry).role === "string" &&
            typeof (h as HistoryEntry).content === "string",
        )
      : [];

    return { messages, history };
  } catch {
    /* Malformed or unreadable storage is the same as no transcript. */
    return empty;
  }
}

export function saveTranscript(
  userId: string | null | undefined,
  transcript: StoredTranscript,
): void {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;

  const messages = transcript.messages.filter(isRestorable).slice(-MAX_STORED_MESSAGES);

  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(keyFor(userId));
      return;
    }
    window.localStorage.setItem(
      keyFor(userId),
      JSON.stringify({
        messages,
        history: transcript.history.slice(-MAX_STORED_HISTORY),
      } satisfies StoredTranscript),
    );
  } catch {
    /* Out of quota, or storage denied. The conversation still works for as
       long as the page is open; it just will not survive the reload. */
  }
}

export function clearTranscript(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* Nothing useful to do. */
  }
}
