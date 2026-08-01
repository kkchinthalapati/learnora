/* Ports the edge-function caller from js/ai.js (:11-136).
 *
 * Every model call in the app goes through `callEdge`. It is deliberately a
 * raw `fetch` rather than `supabase.functions.invoke`, matching the vanilla:
 * invoke buffers and JSON-parses the whole body, which forecloses reading the
 * response as a stream if the edge function ever becomes one.
 *
 * Per Decision #6 this layer throws on failure (the vanilla popped a toast and
 * returned null); callers decide what the user sees.
 */

import { supabase, SUPABASE_URL } from "../lib/supabase";
import type { Settings } from "../lib/settings";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;

/* One retry, not two. The edge function walks its own chain of providers
 * before giving up, so by the time it returns an error every configured model
 * has already been tried — a second client-side replay mostly just adds
 * another minute to the spinner. This still covers a dropped connection. */
export const MAX_RETRIES = 1;
export const RETRY_DELAY_MS = 2000;

/* Slightly above the edge function's own budget, so the server gets to return
 * a real error message rather than the client giving up on it first. */
export const REQUEST_TIMEOUT_MS = 60000;

/** Keep the last 20 messages so a long conversation can't overflow the
 *  provider's context window. */
export const MAX_HISTORY = 20;

export type ChatRole = "user" | "model";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface FilePayload {
  name: string;
  mimeType: string;
  /** base64, without the `data:…;base64,` prefix. */
  data: string;
}

/** `undefined` means free-form chat; the rest map to the edge function's
 *  `modeInstructions` switch (supabase/functions/learnora-ai/index.ts:383-397). */
export type EdgeMode = "plan" | "quiz" | "flashcards" | "notes";

export interface EdgePayload {
  history: ChatMessage[];
  mode?: EdgeMode;
  file?: FilePayload | null;
  settings?: Settings;
}

export interface EdgeResult {
  text: string;
  /** Present (and true) only when `text` is a safety-filter refusal rather
   *  than real content. A JSON-mode refusal (quiz/flashcards/plan) instead
   *  arrives as a non-2xx response and surfaces as `AiError.refused` — this
   *  field exists for the two modes where the edge function answers with a
   *  200 and the refusal sentence *as* `text` (chat and notes, see
   *  supabase/functions/learnora-ai/index.ts's `safetyRefusalResponse`). Chat
   *  can safely ignore it, since the refusal sentence is itself a valid reply
   *  to show; anything that treats `text` as data to save (`generateNotes`)
   *  must check it first. */
  refused?: boolean;
}

/** Error carrying the two flags the vanilla attached to its thrown errors, so
 *  callers can tell a retryable outage from a bad request, and a content
 *  refusal (which has its own user-facing explanation) from a failure. */
export class AiError extends Error {
  readonly retryable: boolean;
  readonly refused: boolean;

  constructor(
    message: string,
    {
      retryable = true,
      refused = false,
    }: { retryable?: boolean; refused?: boolean } = {},
  ) {
    super(message);
    this.name = "AiError";
    this.retryable = retryable;
    this.refused = refused;
  }
}

const GENERIC_FAILURE =
  "AI is temporarily unavailable. Please try again in a moment.";
const TIMEOUT_MESSAGE =
  "That took longer than expected and timed out. Please try again in a moment.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The edge function returns one complete response, not a token stream (see
 *  supabase/functions/learnora-ai/index.ts) — `onText` therefore fires exactly
 *  once, with the whole reply. It exists so callers can share one code path
 *  with a future real stream, and so the chat view has a single place to swap
 *  its "thinking" state for text. */
export async function callEdge(
  payload: EdgePayload,
  onText?: (text: string) => void | Promise<void>,
  retries = MAX_RETRIES,
): Promise<EdgeResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const body = JSON.stringify(payload);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Without a deadline a stalled connection leaves the UI on its loading
      // spinner indefinitely, with no error and no way back.
      const response = await fetch(EDGE_URL, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
          refused?: boolean;
        };
        throw new AiError(errorBody.error || GENERIC_FAILURE, {
          // 4xx means the request itself is wrong (bad/expired token, bad
          // payload) — retrying it just burns another round trip.
          retryable: response.status >= 500 || response.status === 429,
          // A content refusal carries its own explanation and must be shown
          // verbatim rather than flattened into "generation failed".
          refused: errorBody.refused === true,
        });
      }

      const fullText = await response.text();
      let text = fullText;
      let refused = false;
      try {
        const parsed = JSON.parse(fullText) as {
          text?: string;
          refused?: boolean;
        };
        if (parsed && typeof parsed.text === "string") text = parsed.text;
        if (parsed?.refused === true) refused = true;
      } catch {
        /* Not JSON — the body is already the reply text. */
      }

      if (onText) await onText(text);
      // Omitted rather than `false` when not refused, so a caller asserting
      // the plain `{ text }` shape isn't broken by an always-present field.
      return refused ? { text, refused } : { text };
    } catch (err) {
      // Hitting our own deadline means the server already spent its whole
      // budget walking the provider chain. Replaying that costs another
      // minute of spinner to almost certainly time out again.
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AiError(TIMEOUT_MESSAGE, { retryable: false });
      }

      lastError = err;
      const isLast = attempt === retries;
      if (isLast || (err instanceof AiError && !err.retryable)) throw err;
      console.warn(
        `[AI] Retry ${attempt + 1}/${retries}: ${(err as Error)?.message}`,
      );
      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }

  /* Unreachable: the loop either returns or throws. Present so the function
   * has no implicit `undefined` return, which the vanilla did have. */
  throw lastError instanceof Error ? lastError : new AiError(GENERIC_FAILURE);
}

/** Trim history to the last `MAX_HISTORY` messages. */
export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
}

/** A user-facing message for any error out of this layer. A refusal and a
 *  timeout both carry their own wording; anything else gets the fallback the
 *  caller supplies. */
export function aiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AiError) return err.message;
  return fallback;
}
