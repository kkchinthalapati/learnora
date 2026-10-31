/* One section of Learn (views/lesson/LearnPanel): a question to guess at, the
 * idea taught from the lesson's own notes, a check on it, and, for a student
 * who misses the check, the same idea taught a different way with a second,
 * different check. One request per section carries all of it, so a miss
 * costs no extra call and a lesson stays well inside one session's billing
 * (learnora-ai counts every call with the same session key once a day).
 *
 * The shape is the first lesson's (api/firstLesson.ts), with the same rule:
 * a reply missing any part is a failure the screen offers to retry, never
 * padded out. */
import { callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { levelRules, studentStandard } from "../lib/studentLevel";
import { shuffled, toQuestion } from "./firstLesson";
import type { QuizQuestion } from "../lib/aiJson";
import type { LearnSection } from "../lib/learnSections";

export interface LearnStep {
  /** The one idea this section teaches. */
  concept: string;
  hook: QuizQuestion;
  explanation: string;
  check: QuizQuestion;
  /** The same idea from another angle, for a student who missed the check. */
  reteach: string;
  recheck: QuizQuestion;
}

export function buildLearnStepPrompt({
  lesson,
  section,
  otherSections,
  level,
  specLine = "",
}: {
  lesson: string;
  section: LearnSection;
  otherSections: string[];
  level: string;
  specLine?: string;
}): string {
  return `Teach one section of a student's lesson. Teach it so they understand it, not just so they can repeat it.

LESSON: """${fenceUntrusted(lesson)}"""
THIS SECTION: """${fenceUntrusted(section.title)}"""
THE STUDENT'S NOTES FOR THIS SECTION (teach from these; do not contradict them, and do not teach anything they do not support):
"""
${fenceUntrusted(section.body)}
"""
${otherSections.length ? `Other sections of the lesson, taught separately (do not teach them here): ${otherSections.map((t) => fenceUntrusted(t)).join("; ")}.` : ""}
${levelRules(level, specLine)}

Write:
1. "concept": the core idea of this section, in a few words.
2. "hook": a multiple-choice question asking the student to predict or guess something about that idea BEFORE it is taught. Someone new to it should be able to reason about it, not just recall a fact.
3. "explanation": the idea itself, in plain, everyday English: at most 180 words, short sentences, built up from what a beginner already knows, with one concrete example. Use Markdown (bold for the key term; a short list only if the idea has steps) and $...$ for any maths. It must contain everything needed to answer the check.
4. "check": a multiple-choice question on the SAME idea that a student who read the explanation can answer. Make the wrong options the mistakes students really make about it.
5. "reteach": the same idea taught a DIFFERENT way, for a student who got the check wrong: an analogy, or a worked example step by step. At most 120 words. Do not repeat the explanation's wording. Do not mention that they were wrong.
6. "recheck": a NEW multiple-choice question on the same idea, different from the check, that the reteach prepares them for.

Each question has exactly 4 options, exactly one correct, and "correctIndex" pointing at it. Solve each question yourself before writing its key. "feedback" explains why the right answer is right without praising or assuming what the student picked.

Reply with ONLY raw JSON:
{
  "concept": "...",
  "hook": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." },
  "explanation": "...",
  "check": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." },
  "reteach": "...",
  "recheck": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." }
}`;
}

const same = (a: QuizQuestion, b: QuizQuestion) =>
  a.question.trim().toLowerCase() === b.question.trim().toLowerCase();

export function parseLearnStep(
  text: string,
  topic: string,
  random: () => number = Math.random,
): LearnStep | null {
  const parsed = extractJSON<Record<string, unknown>>(text);
  if (!parsed) return null;
  const hook = toQuestion(parsed.hook, topic);
  const check = toQuestion(parsed.check, topic);
  const recheck = toQuestion(parsed.recheck, topic);
  const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  const reteach = typeof parsed.reteach === "string" ? parsed.reteach.trim() : "";
  if (!hook || !check || !recheck || !explanation || !reteach) return null;
  /* A check that repeats an earlier question is a free pass: its answer is
     already on screen. */
  if (same(hook, check) || same(check, recheck) || same(hook, recheck)) return null;
  return {
    concept: typeof parsed.concept === "string" && parsed.concept.trim() ? parsed.concept.trim() : topic,
    hook: shuffled(hook, random),
    explanation,
    check: shuffled(check, random),
    reteach,
    recheck: shuffled(recheck, random),
  };
}

/** Every call for one lesson shares this key, so a whole lesson counts once
 *  against the day's Learn allowance (and SESSION_CALL_CAP stops a runaway). */
export function learnSessionKey(materialId: string): string {
  return `learn-${materialId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 70)}`;
}

export async function generateLearnStep({
  materialId,
  lesson,
  section,
  otherSections,
}: {
  materialId: string;
  lesson: string;
  section: LearnSection;
  otherSections: string[];
}): Promise<LearnStep> {
  const { level, specLine } = await studentStandard(`${lesson} ${section.title}`).catch(() => ({
    level: "",
    specLine: "",
  }));
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildLearnStepPrompt({ lesson, section, otherSections, level: level || "the student's own course", specLine }),
      },
    ],
    /* JSON container only, as the first lesson uses it. */
    mode: "solver",
    tool: "learn",
    sessionKey: learnSessionKey(materialId),
  });
  const step = parseLearnStep(text, section.title);
  if (!step) throw new Error("I couldn't write this part of the lesson just now.");
  return step;
}
