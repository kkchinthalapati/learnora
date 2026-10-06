/* The provisional AI reading of wrong answers the catalogue doesn't name.
 *
 * One call per finished quiz, for its uncatalogued wrong answers (at most
 * MAX_ITEMS). The model may answer "none" for any of them, and the student
 * then gets the generic error-type repair instead. What comes back is
 * provisional: it is stored flagged as unverified, and shown as a named
 * pattern only once the same label has been seen twice
 * (lib/mistakeLoop.ts `isNamedPattern`).
 *
 * Privacy: the prompt carries the subject, each question, the option picked
 * and the right option — nothing about who the student is.
 *
 * Cost: billed to "chat", and skipped entirely when the student is within
 * CHAT_RESERVE calls of the free plan's daily chat allowance, so labelling
 * never spends the calls a student would notice losing. Skipped also when
 * they have refused AI processing; this never opens the consent dialog,
 * because nobody asked for it. Every failure resolves to an empty map: the
 * generic repair is the fallback, and it says it is generic. */

import { callEdge } from "./ai";
import { fetchDailyAiUsage } from "./aiUsage";
import { supabase } from "../lib/supabase";
import { hasAiConsent } from "../lib/aiConsent";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { labelPrompt } from "../lib/tutorPolicy";
import { QUOTAS } from "../lib/entitlements";
import type { ProvisionalLabel } from "../lib/mistakeLoop";
import { questionKey } from "../lib/questionKey";

export const MAX_ITEMS = 5;
export const CHAT_RESERVE = 5;

export interface LabelItem {
  question: string;
  chosen: string;
  correct: string;
  topic: string;
}

export function buildLabelPrompt(subject: string, items: LabelItem[], knownConcepts: string[]): string {
  return labelPrompt(subject, items, knownConcepts, fenceUntrusted);
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** The model's reply, validated. Anything malformed is dropped, item by item. */
export function parseLabels(text: string, items: LabelItem[]): Map<string, ProvisionalLabel> {
  const out = new Map<string, ProvisionalLabel>();
  let parsed: unknown;
  try {
    parsed = extractJSON(text);
  } catch {
    return out;
  }
  const rows = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Record<string, unknown>[]) {
    const i = r?.i;
    if (typeof i !== "number" || !items[i] || r.none) continue;
    const label: ProvisionalLabel = {
      concept: clean(r.concept, 60),
      belief: clean(r.belief, 300),
      reteach: clean(r.reteach, 600),
      contrast: clean(r.contrast, 600),
    };
    if (label.concept.length < 3 || !label.belief || !label.reteach || !label.contrast) continue;
    out.set(questionKey(items[i].question), label);
  }
  return out;
}

export async function labelWrongAnswers(
  subject: string,
  items: LabelItem[],
  knownConcepts: string[] = [],
): Promise<Map<string, ProvisionalLabel>> {
  const batch = items.slice(0, MAX_ITEMS);
  if (batch.length === 0) return new Map();
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return new Map();
    const { data } = await supabase.auth.getSession();
    if (!hasAiConsent(data.session?.user?.user_metadata)) return new Map();
    const usage = await fetchDailyAiUsage();
    if ((usage.usedByTool.chat ?? 0) > QUOTAS.free.chat - CHAT_RESERVE) return new Map();

    const result = await callEdge({
      history: [{ role: "user", content: buildLabelPrompt(subject, batch, knownConcepts) }],
      mode: "quiz",
      tool: "chat",
    });
    return parseLabels(result.text, batch);
  } catch (err) {
    console.warn("[mistakeLabel] no provisional labels; using generic repairs:", err);
    return new Map();
  }
}
