/* Explain-back: at the end of a lesson the student says it in their own
 * words, and Learnora reads what came across.
 *
 * Not a new marker. The "scheme" is the lesson's own parts, each defined by
 * the student's notes for it, and the reply is read by the same code that
 * reads a marked exam answer (lib/photoMarking readMarking) and held to the
 * same rule (api/learn holdToAnswer): a part counts as covered only if the
 * model can quote the student's own words for it, and a wrong idea is kept
 * only if the student actually wrote it.
 *
 * Three things keep it honest:
 *  - Text lifted from the notes is turned away before any call. Copying is
 *    not explaining, and it would otherwise earn every part.
 *  - Leaving a part out is not treated as not knowing it: a few sentences
 *    cannot cover a whole lesson. Only a full, quoted explanation is recorded
 *    as evidence of knowing (see explainBackScore).
 *  - There is no stand-in. If the tutor cannot be reached the step says so.
 *
 * It rides on the lesson's own session key, so it costs no more of the
 * student's allowance than the lesson already did. */

import { AiError, callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { levelRules, studentStandard } from "../lib/studentLevel";
import { readMarking, type Marking, type RawMarking, type SchemePoint } from "../lib/photoMarking";
import { holdToAnswer, learnSessionKey } from "./learn";
import type { LearnSection } from "../lib/learnSections";

/** A lesson with more parts than this is read on its first ones: the prompt
 *  has to stay small enough to answer, and nobody explains twelve ideas in a
 *  paragraph. */
export const MAX_EXPLAIN_PARTS = 8;
/** Fewer words than this is a phrase, not an explanation. */
export const MIN_EXPLAIN_WORDS = 12;
/** A run of this many words taken straight from the notes is copying. */
const COPY_RUN_WORDS = 12;
/** How much of each part's notes the reader is shown. */
const NOTES_PER_PART = 900;

export interface ExplainPart {
  /** The section's key in the lesson's outline, to go back to it. */
  key: string;
  /** What the part is about, as the lesson named it. */
  text: string;
  notes: string;
}

/** The parts an explanation is read against: each section of the lesson,
 *  named by the concept Learn taught it as when it has one. */
export function explainParts(
  sections: readonly LearnSection[],
  concepts: Readonly<Record<string, string | undefined>> = {},
): ExplainPart[] {
  return sections.slice(0, MAX_EXPLAIN_PARTS).map((s) => ({
    key: s.key,
    text: (concepts[s.key] ?? "").trim() || s.title,
    notes: s.body,
  }));
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export function wordCount(text: string): number {
  return words(text).length;
}

/** True when the explanation carries a long run of words straight from the
 *  notes. Short shared phrases ("the rate of reaction") are how anyone would
 *  say it and do not count. */
export function copiedFromNotes(answer: string, notes: string): boolean {
  const said = words(answer);
  if (said.length < COPY_RUN_WORDS) return false;
  const source = ` ${words(notes).join(" ")} `;
  for (let i = 0; i + COPY_RUN_WORDS <= said.length; i++) {
    if (source.includes(` ${said.slice(i, i + COPY_RUN_WORDS).join(" ")} `)) return true;
  }
  return false;
}

export function buildExplainBackPrompt({
  lesson,
  parts,
  answer,
  level,
}: {
  lesson: string;
  parts: readonly ExplainPart[];
  answer: string;
  level: string;
}): string {
  return `A student has just finished a lesson and explained it in their own words. Read their explanation against the lesson's parts and say what came across. You are a supportive tutor reading a first attempt, not an examiner.

LESSON: """${fenceUntrusted(lesson)}"""
THE LESSON'S PARTS (numbered by the app), each with the student's own notes for it. The notes are the only source of what is true here:
${parts
  .map(
    (p, i) =>
      `  [${i}] """${fenceUntrusted(p.text)}"""\n  NOTES FOR [${i}]:\n  """\n  ${fenceUntrusted(p.notes.slice(0, NOTES_PER_PART))}\n  """`,
  )
  .join("\n")}
THE STUDENT'S EXPLANATION:
"""
${fenceUntrusted(answer)}
"""
${levelRules(level)}

HOW TO READ IT:
- Go through every numbered part. Mark a part "awarded" only if the explanation gets its main idea across correctly, in any wording. Naming the topic is not explaining it.
- For an awarded part, copy into "evidence" the exact words from the explanation that carry it, character for character. If you cannot point to the words, do not award it.
- For a part not awarded, say in "note", in under 14 words, which idea is missing, as a nudge ("How the water actually moves"). Do not write the explanation for them, and do not scold.
- A short explanation will leave parts out. That is expected; just mark them not awarded.
- "beliefs": only where the student's own words state something the notes show is wrong (not where they left something out), give the concept, the wrong idea in one short sentence, and the exact words that state it. Usually there are none. Never invent one.
- Judge only against the notes above. If the notes do not cover something the student said, ignore it.

Reply with ONLY raw JSON:
{"legible": true, "unreadable": "", "points": [{"index": 0, "awarded": true, "evidence": "exact words", "note": ""}], "beliefs": [{"concept": "short name", "belief": "the wrong idea", "quote": "exact words"}]}`;
}

/** What an explanation is worth as evidence of knowing the lesson: 1 when
 *  every part was read and covered in the student's own quoted words,
 *  otherwise nothing either way. Leaving a part out of a short explanation
 *  is not evidence of not knowing it. */
export function explainBackScore(marking: Marking): number | null {
  if (marking.kind !== "marked" || marking.unchecked > 0) return null;
  return marking.awarded === marking.total ? 1 : null;
}

export async function checkExplanation({
  materialId,
  lesson,
  subject,
  parts,
  answer,
}: {
  materialId: string;
  lesson: string;
  subject: string;
  parts: readonly ExplainPart[];
  answer: string;
}): Promise<Marking> {
  if (parts.length === 0) throw new AiError("This lesson has no parts to explain yet.", { retryable: false });
  const scheme: SchemePoint[] = parts.map((p) => ({ text: p.text, marks: 1 }));
  const { level } = await studentStandard(`${subject} ${lesson}`).catch(() => ({ level: "" }));
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildExplainBackPrompt({ lesson, parts, answer, level: level || "the student's own course" }),
      },
    ],
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId),
  });
  const marking = readMarking(extractJSON<RawMarking>(text), scheme);
  if (!marking || marking.kind !== "marked") {
    throw new AiError("The tutor answered, but not in a way I could read.", { retryable: true });
  }
  return holdToAnswer(marking, answer);
}
