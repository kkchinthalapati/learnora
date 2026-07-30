/* Topic-only quiz generation — the path the chat's `<ADD_QUIZ>Topic</ADD_QUIZ>`
 * tag takes through the vanilla (`AI.generateQuiz(null, null, { topic })` →
 * `createStudyPackage` with `source: { kind: "topic" }` → `_generateQuizFrom`,
 * js/ai.js:601-679, :758-762, :837-868).
 *
 * Only that path is ported. `createStudyPackage`'s file/link/material sources
 * pull in uploads, storage and notes generation and belong to the Create
 * pipeline, which is still a loose end (see REACT_MIGRATION.md). A topic
 * source needs none of it: the vanilla's own code reduces to
 * `sourceText = "Topic: <topic>"` before it reaches the model.
 *
 * The prompt is carried over verbatim — it is what the edge function's
 * `mode: "quiz"` instructions were tuned against, and its "STRICT DIVERSITY &
 * QUALITY RULES" are the reason generated quizzes don't repeat themselves.
 */

import { callEdge } from "./ai";
import { quizzesApi } from "./quizzes";
import { extractQuizJSON } from "../lib/aiJson";
import { fenceUntrusted } from "../lib/actionTags";
import type { Settings } from "../lib/settings";
import type { Quiz } from "./types";

/** Applied whenever the caller omits a value — the vanilla's `CREATE_DEFAULTS`
 *  (js/ai.js:670-675), minus `cardCount`, which belongs to decks. */
export const QUIZ_DEFAULTS = Object.freeze({
  questionCount: 10,
  difficulty: "Medium" as const,
  personality: "Friendly Tutor",
});

export type QuizDifficulty = "Easy" | "Medium" | "Hard";

export interface QuizOptions {
  questionCount?: number;
  difficulty?: QuizDifficulty;
  personality?: string;
}

/** Thrown when the model replied but nothing quiz-shaped survived validation
 *  — distinct from the service being down, and worth different wording. */
export class QuizShapeError extends Error {
  constructor() {
    super("Couldn't generate a quiz this time. Please try again.");
    this.name = "QuizShapeError";
  }
}

export function difficultyGuidance(difficulty: QuizDifficulty): string {
  if (difficulty === "Easy") {
    return `Target Difficulty: EASY
- Test core definitions, primary facts, fundamental terminology, and basic concepts.
- Questions should be direct, assessing basic comprehension and clear recognition.`;
  }
  if (difficulty === "Hard") {
    return `Target Difficulty: HARD / ADVANCED
- Questions must demand deep critical thinking, multi-step logical deduction, error spotting in subtle/flawed proofs, edge case analysis, counter-examples, or synthesizing multiple principles.
- Avoid superficial recall. For mathematical, scientific, or logical topics, test exact preconditions, subtle logical fallacies, edge cases (e.g. why logic holds or breaks under altered conditions), and higher generalizations.
- Distractors (incorrect choices) must be highly plausible, non-trivial, and reflect common advanced fallacies or subtle misconceptions.`;
  }
  return `Target Difficulty: MEDIUM
- Test conceptual understanding, mechanisms, cause-and-effect, step-by-step applications, and relationships between key ideas.
- Distractors should reflect typical student misunderstandings.`;
}

export function buildQuizPrompt({
  sourceText,
  topic,
  difficulty,
  personality,
  count,
}: {
  sourceText: string;
  topic: string;
  difficulty: QuizDifficulty;
  personality: string;
  count: number;
}): string {
  return `Generate a high-quality, non-repetitive multiple-choice quiz based on the provided material or topic.

Configuration:
- Topic: ${topic}
- Difficulty Level: ${difficulty}
- AI Host Personality: ${personality}
- Total Questions Required: ${count}

${difficultyGuidance(difficulty)}

STRICT DIVERSITY & QUALITY RULES:
1. ABSOLUTELY NO REPETITIVE QUESTIONS: Every single question MUST cover a completely DIFFERENT concept, sub-step, logical component, or angle. DO NOT ask back-to-back similar questions or rephrase the same premise.
2. QUESTION ANGLE VARIETY: Distribute questions across different angles such as:
   - Core Principles / Definitions
   - Step Mechanics & Logical Justifications (Why a specific step or assumption is necessary)
   - Flaw Spotting / Error Identification (Finding the logical mistake in a flawed statement or step)
   - Edge Cases & Counter-examples (Examining failure conditions or special cases)
   - Extensions & Applications (Applying the concept to related contexts or generalizations)
3. DISTRACTORS: All wrong choices MUST be realistic, meaningful, and carefully crafted. No obvious filler or duplicate choices across options.
4. FEEDBACK: For EACH question, include a comprehensive "feedback" string. The feedback MUST explain why the correct answer is right and why each incorrect option is wrong, written in the voice of the chosen AI Host Personality (${personality}). Address the student directly and engage them.

Material / Topic Content:
"""
${sourceText}
"""`;
}

/** Generate and save a quiz on a bare topic. Throws on failure per Decision
 *  #6; `QuizShapeError` distinguishes "the model replied with nothing usable"
 *  from a transport failure. */
export async function generateQuizFromTopic(
  topic: string,
  settings: Settings,
  options: QuizOptions = {},
): Promise<Quiz> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error("Please enter a topic.");

  const difficulty = options.difficulty ?? QUIZ_DEFAULTS.difficulty;
  const personality = options.personality ?? QUIZ_DEFAULTS.personality;
  const count = options.questionCount ?? QUIZ_DEFAULTS.questionCount;

  /* The topic reaches here from a model reply (`<ADD_QUIZ>…</ADD_QUIZ>`), so
     it is not app-authored text — fenced before it goes back into a prompt. */
  const safeTopic = fenceUntrusted(trimmed);

  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildQuizPrompt({
          sourceText: `Topic: ${safeTopic}`,
          topic: safeTopic,
          difficulty,
          personality,
          count,
        }),
      },
    ],
    mode: "quiz",
    settings,
  });

  const questions = extractQuizJSON(text);
  if (questions.length === 0) throw new QuizShapeError();

  return quizzesApi.add(null, null, `${trimmed} Quiz`, questions);
}
