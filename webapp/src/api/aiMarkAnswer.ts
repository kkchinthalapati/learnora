/* Photo marking — the model's half (lib/photoMarking.ts decides what its
 * reply may count for).
 *
 * One call: the photo of the student's handwritten answer goes as the
 * attachment (the edge function sends images only to a vision model, and
 * answers "photo reading is unavailable" rather than guessing when none is
 * up); the numbered scheme and the question go in the app context. There is
 * no local stand-in: a mark the model didn't give is not a mark. A failure
 * throws, and the screen offers to try again.
 *
 * Billed as the Exam Deconstructor, the past-paper tool. */

import { AiError, callEdge } from "./ai";
import { fileToPayload } from "./studyPackage";
import { fenceUntrusted } from "../lib/actionTags";
import { extractJSON } from "../lib/aiJson";
import { readMarking, type Marking, type RawMarking, type SchemePoint } from "../lib/photoMarking";
import type { Settings } from "../lib/settings";
import { levelRules, studentStandard } from "../lib/studentLevel";

export const MARK_REQUEST = "Mark the handwritten answer in the attached photo against the mark scheme in the app context.";

export function buildMarkingContext(
  scheme: readonly SchemePoint[],
  question: string,
  subject: string,
  level: string,
  specLine = "",
): string {
  return `This screen is "Mark my answer". You are an exam marker. The attached photo is a student's own handwritten answer.

SUBJECT: ${fenceUntrusted(subject)}
${question.trim() ? `QUESTION (as the student typed it): """${fenceUntrusted(question)}"""\n` : ""}MARK SCHEME (the student pasted it from the paper they are practising; each point is numbered by the app):
${scheme.map((p, i) => `  [${i}] """${fenceUntrusted(p.text)}""" (${p.marks} mark${p.marks === 1 ? "" : "s"})`).join("\n")}

${levelRules(level, specLine)}

HOW TO MARK:
- Read the handwriting first. If you cannot read enough of it to mark fairly, set "legible" to false, say in "unreadable" what you couldn't read, and leave "points" empty. Never guess at words you can't read.
- Mark every numbered point, by its number, against what is actually written. Award a point only if the answer says it, or says something a marker following this scheme would accept as the same. Do not award for things implied, crossed out, or that you would have liked to see.
- For an awarded point, copy into "evidence" the exact words from the answer that earn it. If you can't point to the words, don't award it.
- For a missed point, say in "note", in under 12 words, what was missing. Do not write the answer out for them.
- Do not add up marks. Do not invent points that are not in the scheme.
- "beliefs": only where the student's own words state something wrong (not where they left something out), give the concept, the wrong idea in a short sentence, and the exact words that state it. Usually there are none; then give an empty list.

Reply with ONLY raw JSON:
{"legible": true, "unreadable": "", "points": [{"index": 0, "awarded": true, "evidence": "exact words", "note": ""}], "beliefs": [{"concept": "short name", "belief": "the wrong idea", "quote": "exact words"}]}`;
}

export async function markAnswerPhoto(
  photo: File,
  scheme: readonly SchemePoint[],
  question: string,
  subject: string,
  settings?: Settings,
  signal?: AbortSignal,
): Promise<Marking> {
  const [{ level, specLine }, file] = await Promise.all([
    studentStandard(`${subject} ${question}`),
    fileToPayload(photo),
  ]);
  const { text } = await callEdge(
    {
      history: [{ role: "user", content: MARK_REQUEST }],
      mode: "solver",
      tool: "examDeconstructor",
      file,
      context: buildMarkingContext(scheme, question, subject, level, specLine),
      ...(settings ? { settings } : {}),
    },
    undefined,
    undefined,
    signal,
  );
  const marking = readMarking(extractJSON<RawMarking>(text), scheme);
  if (!marking) throw new AiError("The marker answered, but not in a way I could read.", { retryable: true });
  return marking;
}
