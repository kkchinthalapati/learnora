import { useEffect } from "react";
import { useDialog } from "../context/dialog";
import { useToast } from "../context/toast";
import { registerAiConsentRequester, setAiConsent } from "../lib/aiConsent";

/* Asks for AI consent at the moment it is needed — see lib/aiConsent.ts.
 *
 * Renders nothing: it lends the app's own confirm dialog to the non-React
 * AI client, which awaits the answer and then either carries on with the
 * request the student just made or stops it with a plain explanation. */
export function AiConsentBridge() {
  const { confirm } = useDialog();
  const { showToast } = useToast();

  useEffect(
    () =>
      registerAiConsentRequester(async () => {
        const allowed = await confirm(
          "To answer, Learnora sends what you're working on — your question, notes or answers — to its AI providers, Anthropic (Claude) and Google (Gemini). Nothing is sent unless you allow it, and you can change your mind any time in Settings ▸ Privacy.",
          {
            title: "Let Learnora's AI use your study data?",
            confirmText: "Allow",
            cancelText: "Not now",
          },
        );
        if (!allowed) return false;
        try {
          await setAiConsent(true);
          return true;
        } catch {
          showToast(
            "Couldn't save that. Check your connection and try again.",
            { error: true },
          );
          return false;
        }
      }),
    [confirm, showToast],
  );

  return null;
}
