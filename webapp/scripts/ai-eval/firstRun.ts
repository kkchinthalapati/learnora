/* The first-run lesson request, as FirstRunView sends it. */
import { generateQuizQuestions } from "../../src/api/aiQuiz";
import { fenceUntrusted } from "../../src/lib/actionTags";
import type { Settings } from "../../src/lib/settings";

export function firstRunLessonRequest(subject: string, settings: Settings) {
  return generateQuizQuestions({
    sourceText: `Topic: ${fenceUntrusted(subject)}\nWrite the first question as a "guess what happens" question a beginner could reasonably guess at, and the second as a check that the idea landed.`,
    topic: fenceUntrusted(subject),
    settings,
    options: { questionCount: 2, difficulty: "Easy" },
  });
}
