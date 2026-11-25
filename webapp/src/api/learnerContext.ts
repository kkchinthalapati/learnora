/* What Learn, notes and the podcast know about the student they're writing
 * for: their recurring mistakes (the misconception ledger), what their
 * answered questions say they know (the knowledge model), and their level.
 * The Ask tutor already reads all three (context/ChatProvider.tsx); before
 * this, Learn wrote mistakes to the ledger and never read them back, and
 * notes were written the same for every student.
 *
 * Also the settings those calls send: the student's language and tutor
 * persona, with the length and depth knobs left at their defaults, because
 * each of these prompts sets its own lengths.
 *
 * Best-effort throughout, like the chat's reads: a failed read gives the
 * ledger's and the knowledge model's own "nothing on record, don't invent
 * any" lines, which is the honest fallback. */

import { misconceptionsApi } from "./misconceptions";
import { requireUserId } from "./session";
import { loadKnowledgeSummary } from "./studentEvidence";
import { formatMisconceptionsForPrompt } from "../lib/misconceptions";
import { loadAdaptationBlock } from "./learnerSignals";
import { loadLearnerProfileRule } from "./learnerStyle";
import { studentLevel } from "../lib/studentLevel";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "../lib/settings";

/* A lesson makes several calls a minute apart; one read serves them all. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; block: Promise<string> }>();

const HOW_TO_USE = `HOW TO USE THE STUDENT'S RECORD ABOVE:
- If a misconception listed above is about this material, deal with it head-on where that idea is taught: state the wrong idea plainly as a common one (never "you think…" or "last time you…"), show why it's wrong, then give the right idea. Where the task includes checks or questions, make one of them test that idea.
- Spend less time on topics listed as secure or right so far, and more on topics listed as still learning or starting to slip, when they are part of this material.
- Ignore anything above that isn't part of this material. Never mention the record itself, never list the student's weaknesses back to them, and never invent a mistake or a level of knowledge that isn't listed.`;

/** The block to add to a prompt. `subject` narrows the ledger to that
 *  subject (as the lesson's Mistakes tab does); without it the most
 *  important open mistakes across subjects are used. */
export async function loadLearnerContext(
  subject?: string | null,
): Promise<string> {
  /* Per account, so a shared laptop never hands one student's record to the next. */
  const userId = await requireUserId().catch(() => "");
  const key = `${userId}:${(subject ?? "").trim().toLowerCase()}`;
  const hit = cache.get(key);
  const cached = hit && Date.now() - hit.at < CACHE_MS ? hit.block : null;
  const block = cached ?? loadRecord(subject);
  if (!cached) cache.set(key, { at: Date.now(), block });
  /* Read fresh each time (it keeps its own short cache, cleared whenever the
     student rates something), so a rating shapes the very next thing written. */
  const [record, adaptation] = await Promise.all([block, loadAdaptationBlock().catch(() => "")]);
  return [record, adaptation].filter(Boolean).join("\n\n");
}

function loadRecord(subject?: string | null): Promise<string> {
  return (async () => {
    const [ledger, knowledge, level] = await Promise.all([
      misconceptionsApi.fetchAll().catch((err: unknown) => {
        console.warn(
          "[learnerContext] could not read the misconception ledger:",
          err,
        );
        return [];
      }),
      loadKnowledgeSummary(),
      studentLevel().catch(() => ""),
    ]);
    return [
      level
        ? `THE STUDENT: studying at ${level} level. Pitch vocabulary and examples to that.`
        : "",
      formatMisconceptionsForPrompt(ledger, subject ? { subject } : {}),
      knowledge,
      HOW_TO_USE,
    ]
      .filter(Boolean)
      .join("\n\n");
  })();
}

/** For tools that teach without a lesson around them (Explain, the study
 *  guide): how this student learns (their "How you learn" answers) and what
 *  their ratings said. No ledger: those tools have their own rules about
 *  assuming a mistake. Never throws; "" when there is nothing. */
export async function loadPresentationLines(): Promise<string> {
  const [profile, adaptation] = await Promise.all([
    loadLearnerProfileRule().catch(() => ""),
    loadAdaptationBlock().catch(() => ""),
  ]);
  return [profile, adaptation].filter(Boolean).join("\n\n");
}

/** Settings for a Learn, notes or podcast call: the student's language and
 *  persona, and the default length and depth, since those prompts set
 *  their own. */
export function learnerSettings(): Settings {
  const s = loadSettings();
  return {
    ...s,
    aiDepth: DEFAULT_SETTINGS.aiDepth,
    aiStyle: DEFAULT_SETTINGS.aiStyle,
    aiConciseness: DEFAULT_SETTINGS.aiConciseness,
  };
}

/** For tests. */
export function resetLearnerContextCache(): void {
  cache.clear();
}
