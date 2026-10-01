/* The first lesson a brand-new student gets on /welcome.
 *
 * It used to be the quiz generator asked for two questions. The screen
 * promised "a short lesson", but there was no lesson: "Show me how →" went
 * straight from the first question to the second. The quiz prompt's own
 * diversity rule ("every single question MUST cover a completely DIFFERENT
 * concept") then put the check on an idea that had never been taught. A
 * real run of that prompt hooked on WW1 alliances and checked nationalism.
 * When the model returned one question, the "check" re-asked the first one,
 * with its answer already on screen.
 *
 * This is one request for the three parts the screen needs: a question to
 * guess at, a short explanation of the idea behind it, and a check on that
 * same idea. A reply missing any part is a failure (the screen offers a
 * retry), never padded out. */
import { callEdge } from "./ai";
import { extractJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import { levelRules } from "../lib/studentLevel";
import type { QuizQuestion } from "../lib/aiJson";

export interface FirstLesson {
  /** The one idea this lesson teaches. */
  concept: string;
  hook: QuizQuestion;
  /** The teaching: under ~120 words, with an example. */
  explanation: string;
  check: QuizQuestion;
}

export function buildFirstLessonPrompt(topic: string, level: string): string {
  return `Write a three-minute first lesson for a student who has just started on this topic.

TOPIC (the student's own words): """${fenceUntrusted(topic)}"""
${levelRules(level)}

Pick ONE core idea from the topic that a beginner can learn in a minute. Then write:
1. "hook": a multiple-choice question asking the student to guess or predict something about that idea before being taught. A beginner should be able to reason about it, not just recall a fact.
2. "explanation": the idea itself, taught in plain, everyday English: at most 120 words, in short sentences, with one concrete example. It must contain everything needed to answer the check.
3. "check": a multiple-choice question on the SAME idea, which a student who read the explanation can answer. Do not test anything the explanation did not teach.

Each question has exactly 4 options, exactly one correct, and "correctIndex" pointing at it. Solve each question yourself before writing its key. "feedback" explains why the right answer is right without praising or assuming what the student picked.

Reply with ONLY raw JSON:
{
  "concept": "the idea, in a few words",
  "hook": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." },
  "explanation": "...",
  "check": { "question": "...", "choices": ["...", "...", "...", "..."], "correctIndex": 0, "feedback": "..." }
}`;
}

function toQuestion(raw: unknown, topic: string): QuizQuestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const choices = Array.isArray(r.choices) ? r.choices.filter((c): c is string => typeof c === "string" && c.trim() !== "") : [];
  const correctIndex = Number(r.correctIndex);
  if (typeof r.question !== "string" || !r.question.trim()) return null;
  if (choices.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    return null;
  }
  return {
    question: r.question.trim(),
    choices,
    correctIndex,
    topic,
    feedback: typeof r.feedback === "string" ? r.feedback.trim() : undefined,
  };
}

/** Shuffle the options so the key's position carries no signal (the quiz
 *  generator's server-side shuffle does not run for this request). */
function shuffled(q: QuizQuestion, random: () => number): QuizQuestion {
  const order = q.choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, choices: order.map((i) => q.choices[i]), correctIndex: order.indexOf(q.correctIndex) };
}

export function parseFirstLesson(
  text: string,
  topic: string,
  random: () => number = Math.random,
): FirstLesson | null {
  const parsed = extractJSON<Record<string, unknown>>(text);
  if (!parsed) return null;
  const hook = toQuestion(parsed.hook, topic);
  const check = toQuestion(parsed.check, topic);
  const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  if (!hook || !check || !explanation) return null;
  /* The check must not be the hook again — that was a free pass. */
  if (hook.question.toLowerCase() === check.question.toLowerCase()) return null;
  return {
    concept: typeof parsed.concept === "string" && parsed.concept.trim() ? parsed.concept.trim() : topic,
    hook: shuffled(hook, random),
    explanation,
    check: shuffled(check, random),
  };
}

export async function generateFirstLesson(topic: string, level: string): Promise<FirstLesson> {
  const { text } = await callEdge({
    history: [{ role: "user", content: buildFirstLessonPrompt(topic, level) }],
    /* JSON container only; billed as the quiz it replaces. */
    mode: "solver",
    tool: "quiz",
  });
  const lesson = parseFirstLesson(text, topic);
  if (!lesson) throw new Error("I couldn't write that lesson just now.");
  return lesson;
}
