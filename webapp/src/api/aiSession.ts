/* The Session screen's own tutor turns.
 *
 * The five modes run on the tools' existing endpoints (aiDebugger for
 * Explain, aiSparring for Socratic, aiQuiz for Practice, aiFeynman for
 * Teach; Recall is FSRS and needs no AI). This file covers the two things
 * none of them does: answering a question typed mid-step, and re-checking an
 * answer the student flagged. Both go through the ordinary metered chat tool.
 */

import { callEdge } from "./ai";
import { levelRules, studentStandard } from "../lib/studentLevel";
import { fenceUntrusted } from "../lib/actionTags";
import type { Settings } from "../lib/settings";

export interface SessionTurn {
  role: "user" | "model";
  content: string;
}

/** The tutor never goes more than about 150 words without a check. */
export const MAX_TURN_WORDS = 150;

export function buildSessionContext({
  objective,
  step,
  mode,
  watchingFor,
}: {
  objective: string;
  step?: string;
  mode: string;
  watchingFor?: string;
}): string {
  return `[SYSTEM — Learnora study session]
You are a patient tutor inside a focused study session.
GOAL: ${fenceUntrusted(objective)}
${step ? `CURRENT STEP: ${fenceUntrusted(step)}` : ""}
MODE: ${mode}
${watchingFor ? `WATCH FOR: the student has previously believed "${fenceUntrusted(watchingFor)}". If their question shows it, name it gently.` : ""}
RULES:
- Answer in at most three short sentences (under ${MAX_TURN_WORDS} words), about the current step only.
- End with one short check question the student can answer in a sentence.
- If the student asks for the answer to a check, give a hint first unless they say "just tell me".
- No emoji. No exclamation marks.`;
}

/** Answer a question the student typed during a step. */
export async function askInSession({
  question,
  history,
  context,
  topic,
  settings,
  signal,
}: {
  question: string;
  history: SessionTurn[];
  context: string;
  /** What the session is about, used to find the exam spec it belongs to. */
  topic?: string;
  settings?: Settings;
  signal?: AbortSignal;
}): Promise<string> {
  /* The level travels with every in-session answer, as it does with the
     plan and the checks, so a follow-up is pitched where the plan was. */
  const { level, specLine } = await studentStandard(topic).catch(() => ({
    level: "",
    specLine: "",
  }));
  const { text } = await callEdge(
    {
      history: [...history.slice(-8), { role: "user", content: question }],
      context: level ? `${context}\n${levelRules(level, specLine)}` : context,
      tool: "chat",
      settings,
    },
    undefined,
    undefined,
    signal,
  );
  return text.trim();
}

export type FlagReason = "contradicts_notes" | "factually_wrong" | "confusing";

export const FLAG_REASONS: ReadonlyArray<{ id: FlagReason; label: string }> = [
  { id: "contradicts_notes", label: "Contradicts my notes" },
  { id: "factually_wrong", label: "Factually wrong" },
  { id: "confusing", label: "Confusing" },
];

/** Ask the tutor to re-check an answer the student flagged, and say plainly
 *  whether it was wrong. Nothing the student answered is marked against them
 *  on the strength of a flagged answer. */
export async function recheckAnswer({
  answer,
  reason,
  objective,
  source,
  settings,
}: {
  answer: string;
  reason: FlagReason;
  objective: string;
  source?: string;
  settings?: Settings;
}): Promise<string> {
  const why = FLAG_REASONS.find((r) => r.id === reason)?.label ?? reason;
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: `The student flagged this tutor answer as "${why}". Re-check it${
          source ? ` against ${fenceUntrusted(source)}` : ""
        } and reply in two sentences: first whether it was wrong (start with "It was wrong:" or "It holds up:"), then the correct statement.\n\nANSWER:\n"""\n${fenceUntrusted(answer)}\n"""`,
      },
    ],
    context: buildSessionContext({ objective, mode: "recheck" }),
    tool: "chat",
    settings,
  });
  return text.trim();
}
