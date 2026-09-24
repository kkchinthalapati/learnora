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
import type { AiToolId } from "../lib/entitlements";
import { queryClient } from "../lib/queryClient";
import { aiUsageKeys } from "./aiUsage";

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
 *  `modeInstructions` switch (supabase/functions/learnora-ai/index.ts). */
export type EdgeMode =
  "plan" | "quiz" | "flashcards" | "notes" | "rewrite" | "solver";

export interface EdgePayload {
  history: ChatMessage[];
  mode?: EdgeMode;
  file?: FilePayload | null;
  settings?: Settings;
  /** Which metered AI tool this call counts against (see `AI_TOOLS` in
   *  entitlements.ts). Distinct from `mode`, which is only the response-shape
   *  contract — several product features share a `mode` (pre-mortem, feynman
   *  and the exam deconstructor all send `mode: "quiz"` purely for its JSON
   *  parsing) but must still be billed as separate tools. Optional only for
   *  callers not yet migrated; the edge function falls back to "chat". */
  tool?: AiToolId;
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
/** Not a failure: the student pressed Stop. Non-retryable so no caller
 *  quietly starts the request again on their behalf. */
export const CANCELLED_MESSAGE = "Stopped.";
/** The fetch never reached the server. Browsers word this as "Failed to
 *  fetch" / "Load failed" / "NetworkError…", none of which a student should
 *  have to decode. */
export const OFFLINE_MESSAGE =
  "You seem to be offline, so Learnora couldn't reach its AI. Check your connection and try again.";
export const NETWORK_MESSAGE =
  "The connection dropped before Learnora's AI could answer. Please try again.";

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
  /** Lets the caller give up before the deadline does. A first answer takes
   *  around thirty seconds against the live chain, most of it invisible, so
   *  a student who has changed their mind needs a way out that actually
   *  stops the request rather than hiding it. */
  externalSignal?: AbortSignal,
): Promise<EdgeResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const body = JSON.stringify(payload);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    /* A cancelled request must not start another attempt. Checked before
       each one rather than only at the fetch, so pressing Stop during the
       backoff between retries ends it there. */
    if (externalSignal?.aborted) throw new AiError(CANCELLED_MESSAGE, { retryable: false });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      /* Two ways to end this call: the deadline, without which a stalled
         connection leaves the UI spinning forever with no error and no way
         back, and the caller. Combined by hand rather than with
         AbortSignal.any, which jsdom does not implement in the versions
         this suite runs under. */
      const attemptController = new AbortController();
      const onExternalAbort = () => attemptController.abort();
      const deadline = setTimeout(() => attemptController.abort(), REQUEST_TIMEOUT_MS);
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

      let response: Response;
      try {
        response = await fetch(EDGE_URL, {
          method: "POST",
          headers,
          body,
          signal: attemptController.signal,
        });
      } finally {
        clearTimeout(deadline);
        externalSignal?.removeEventListener("abort", onExternalAbort);
      }

      if (externalSignal?.aborted) {
        throw new AiError(CANCELLED_MESSAGE, { retryable: false });
      }

      /* The server has just ruled on this user's daily allowance, so whatever
         the usage meter is showing is now behind: a 2xx spent one generation,
         and a 429 means they are at the ceiling. Every AI call in the app
         funnels through here, so this one line keeps the meter honest for all
         of them. Deliberately not awaited — the meter is cosmetic, and must
         never delay a generation or fail one by throwing. */
      if (response.ok || response.status === 429) {
        void queryClient.invalidateQueries({ queryKey: aiUsageKeys.today });
      }

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
          text?: string;
          refused?: boolean;
        };
        /* `text` as well as `error`, because the edge function's rate-limit
           replies are not shaped alike: `rateLimitResponse` puts the message
           under `error` for the JSON modes (quiz, flashcards, plan) and under
           `text` for everything else — chat, notes, the tutor. Reading only
           `error` meant the modes a student uses most answered a spent daily
           allowance with the generic failure line, and the copy that actually
           explains it ("They reset at midnight — or Learnora Pro raises the
           limit") never reached anyone. */
        throw new AiError(
          /* A 5xx body is the server talking to itself ("Internal error"),
             not to the student. Only 4xx bodies — rate limits, refusals,
             bad input — carry copy written for a person. */
          response.status >= 500
            ? GENERIC_FAILURE
            : errorBody.error || errorBody.text || GENERIC_FAILURE,
          {
            // 4xx means the request itself is wrong (bad/expired token, bad
            // payload) — retrying it just burns another round trip.
            //
            // 429 included: both ceilings behind it are measured in hours (a
            // daily allowance that resets at midnight UTC) or minutes (the
            // burst window), so a 2-second replay cannot clear either. It only
            // delayed the message by the retry backoff and spent a second
            // round trip proving the server meant it.
            retryable: response.status >= 500,
            // A content refusal carries its own explanation and must be shown
            // verbatim rather than flattened into "generation failed".
            refused: errorBody.refused === true,
          },
        );
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
      //
      // A cancel aborts the same controller and so arrives here as the same
      // AbortError. The signal is what tells them apart, and it matters:
      // telling a student their own Stop press "timed out" reads as a
      // failure they should retry.
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw externalSignal?.aborted
          ? new AiError(CANCELLED_MESSAGE, { retryable: false })
          : new AiError(TIMEOUT_MESSAGE, { retryable: false });
      }

      lastError = err;
      const isLast = attempt === retries;
      if (err instanceof AiError && !err.retryable) throw err;
      if (isLast) {
        if (err instanceof AiError) throw err;
        throw new AiError(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? OFFLINE_MESSAGE
            : NETWORK_MESSAGE,
        );
      }
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
