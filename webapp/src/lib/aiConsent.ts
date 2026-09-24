import { supabase } from "./supabase";

/* Consent to send study data to the AI providers, asked for when it is
 * first needed rather than as a condition of opening an account.
 *
 * Sign-up used to require the box to be ticked, so a student who only
 * wanted the timer, tasks or flashcards had to agree to share their study
 * data with Anthropic and Google to get in at all — consent that is a
 * condition of the service is not freely given. Now the box is optional and
 * the first AI request from someone who has not agreed asks them, in
 * context, with the request waiting on the answer.
 *
 * The answer lives in `user_metadata.consent_given`, which the
 * `sync_profile_from_auth_user` trigger already mirrors into
 * `public.profiles.consent_given`.
 *
 * Only an explicit `false` counts as "not agreed". Accounts created before
 * the consent flag existed carry no key at all and have always had AI
 * access; treating a missing key as a refusal would switch AI off for all
 * of them overnight with no notice. Every account created from here on
 * writes the key explicitly, and the edge function applies the same rule
 * (supabase/functions/learnora-ai), so the client and server agree. */

export const AI_CONSENT_DECLINED_MESSAGE =
  "Learnora's AI needs your OK before it can use your study data. You can turn it on any time in Settings ▸ Privacy.";

export function hasAiConsent(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.consent_given !== false;
}

type ConsentRequester = () => Promise<boolean>;

let requester: ConsentRequester | null = null;
let pending: Promise<boolean> | null = null;
/* One student action can make several AI calls in a row — chat runs web
   research, then the model. A "Not now" answers all of them: without this
   the same dialog came straight back for the second call. A new action a
   few seconds later is a new question and asks again. */
const DECLINE_HOLD_MS = 3000;
let declinedAt = 0;

/** The app registers the dialog that asks; see AiConsentBridge. Returns the
 *  unregister function for the effect cleanup. */
export function registerAiConsentRequester(fn: ConsentRequester): () => void {
  requester = fn;
  return () => {
    if (requester === fn) requester = null;
  };
}

/** Resolves true once the student has agreed — immediately if they already
 *  had. Several AI calls can start at once (Create runs one per output), so
 *  concurrent callers share one question rather than stacking dialogs.
 *  With nothing registered to ask (a test, a script), a refusal stands. */
export async function ensureAiConsent(
  metadata: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  if (hasAiConsent(metadata)) return true;
  if (!requester) return false;
  if (Date.now() - declinedAt < DECLINE_HOLD_MS) return false;
  if (!pending) {
    pending = requester()
      .then((granted) => {
        if (!granted) declinedAt = Date.now();
        return granted;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Record the student's answer on their account. The trigger copies it to
 *  `profiles`, where it is queryable for audit. */
export async function setAiConsent(granted: boolean): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: {
      consent_given: granted,
      consent_updated_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error(error.message);
}

/** Test seam: forget any recent decline. */
export function resetAiConsentState(): void {
  pending = null;
  declinedAt = 0;
}
