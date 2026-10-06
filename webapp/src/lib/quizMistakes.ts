/* A finished quiz, turned into ledger writes under the mistake loop.
 *
 * Every wrong answer is matched (lib/mistakeLoop.ts): a catalogue belief if
 * the pick states one, else the AI labeller's provisional reading (passed in
 * from api/mistakeLabel.ts, which may have declined or failed), else a
 * generic error type filed under the question's topic, as quizzes always
 * did. Each carries its repair text, the question it was about, and a key
 * that makes a retried write land once. */

import type { QuizQuestion } from "./aiJson";
import type { MisconceptionCandidate } from "./misconceptions";
import { prepareCandidates } from "./misconceptions";
import { matchWrongAnswer, repairFor, type ProvisionalLabel } from "./mistakeLoop";
import { observationKey, questionKey } from "./questionKey";
import { answerForIndex, type StoredAnswer } from "../views/quiz/quizMeta";

export interface AnsweredQuestion {
  questionId: string | number;
  question: string;
  topic: string;
  chosen: string;
  correct: string;
  isCorrect: boolean;
  /** A guess, or a right answer reached with a hint: no ledger correction. */
  guessed: boolean;
  /** The worked solution was shown (lib/tutorPolicy.ts): a miss the loop
   *  retests, with the worked solution as its repair. */
  workedSolution: boolean;
}

export function answeredQuestions(
  questions: QuizQuestion[],
  answers: StoredAnswer[],
): AnsweredQuestion[] {
  return questions.flatMap((q, i) => {
    const a = answerForIndex(answers, questions, i);
    if (!a) return [];
    return [
      {
        questionId: q.id ?? i,
        question: q.question,
        topic: (a.topic ?? q.topic ?? "").trim(),
        chosen: q.choices[a.chosenIndex] ?? "",
        correct: q.choices[q.correctIndex] ?? "",
        isCorrect: a.correct && (a.hintRung ?? 0) < 3,
        guessed: a.confidence === "guess" || (a.hintRung ?? 0) > 0,
        workedSolution: (a.hintRung ?? 0) >= 3,
      },
    ];
  });
}

/** Wrong answers the catalogue doesn't name: the ones worth an AI reading. */
export function unmatchedWrong(answered: AnsweredQuestion[]): AnsweredQuestion[] {
  return answered.filter(
    (a) => !a.isCorrect && matchWrongAnswer(a).kind !== "catalogue",
  );
}

export function quizLoopCandidates(
  answered: AnsweredQuestion[],
  ctx: { subject: string; attemptKey: string; labels: Map<string, ProvisionalLabel> },
): MisconceptionCandidate[] {
  const out: MisconceptionCandidate[] = [];
  for (const a of answered) {
    const qk = questionKey(a.question);
    const key = (kind: string) => observationKey("quiz", ctx.attemptKey, qk, kind);

    if (a.isCorrect) {
      /* A guess that landed proves nothing (and Recall brings it back). */
      if (a.guessed || !a.topic) continue;
      out.push({
        subject: ctx.subject,
        concept: a.topic,
        summary: "",
        severity: "moderate",
        tool: "quiz",
        sourceId: ctx.attemptKey,
        kind: "correction",
        detail: `Answered correctly on ${a.topic}.`,
        questionKey: qk,
        idempotencyKey: key("c"),
      });
      continue;
    }

    /* A worked-through question has no pick to read a belief from, so it is
       a plain concept gap under its topic. */
    const match = a.workedSolution
      ? ({ kind: "generic", errorType: "concept" } as const)
      : matchWrongAnswer(a, ctx.labels.get(qk));
    const repair = repairFor(match, a);
    const common = {
      subject: ctx.subject,
      severity: "moderate" as const,
      tool: "quiz" as const,
      kind: "evidence" as const,
      detail: a.workedSolution
        ? `Needed the worked solution for "${a.question}".`
        : a.chosen
          ? `Chose "${a.chosen}".`
          : `Left "${a.question}" unanswered.`,
      workedSolution: a.workedSolution,
      questionKey: qk,
      idempotencyKey: key("e"),
      repairText: repair.reteach,
      contrastText: repair.contrast,
    };

    if (match.kind === "catalogue") {
      /* Same source id as the inline repair card in QuizRunner, so whichever
         writes first is the only observation. */
      out.push({
        ...common,
        concept: match.entry.concept,
        summary: match.entry.belief,
        catalogueId: match.entry.id,
        provisional: false,
        sourceId: `${ctx.attemptKey}:${a.questionId}`,
        skipIfSourceRecorded: true,
      });
    } else if (match.kind === "provisional") {
      out.push({
        ...common,
        concept: match.label.concept,
        summary: match.label.belief,
        provisional: true,
        sourceId: ctx.attemptKey,
      });
    } else {
      if (!a.topic) continue;
      out.push({
        ...common,
        concept: a.topic,
        summary: `Missed: ${a.question}`,
        errorType: match.errorType,
        provisional: false,
        sourceId: ctx.attemptKey,
      });
    }
  }
  /* prepareCandidates merges same-concept duplicates within a batch; keep the
     first per concept and kind, as it always has. */
  return prepareCandidates(out);
}
