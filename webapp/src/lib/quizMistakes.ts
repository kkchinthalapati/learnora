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
import { diagnoseWrongAnswer } from "./diagnosis";
import { seededMatch } from "./questionVetting";
import { normaliseTopicKey } from "./topicKey";
import type { Confidence } from "../components/learning/options";

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
  /** The catalogue misconception the chosen distractor is mapped to: a
   *  diagnosis by construction, no reading of the wording needed. */
  misconceptionId?: string | null;
  /** The confidence picker beside the question, when used. */
  confidence?: Confidence | null;
  secondsSpent?: number | null;
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
        chosen: a.response ?? q.choices[a.chosenIndex] ?? "",
        correct: q.choices[q.correctIndex] ?? "",
        isCorrect: a.correct && (a.hintRung ?? 0) < 3,
        guessed: a.confidence === "guess" || (a.hintRung ?? 0) > 0,
        workedSolution: (a.hintRung ?? 0) >= 3,
        confidence: a.confidence ?? null,
        secondsSpent: a.secondsSpent ?? null,
        misconceptionId:
          a.misconception ??
          (a.chosenIndex >= 0 && a.chosenIndex !== q.correctIndex
            ? (q.distractorMisconceptions?.[a.chosenIndex] ?? null)
            : null),
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
  ctx: {
    subject: string;
    attemptKey: string;
    labels: Map<string, ProvisionalLabel>;
    /** Topic keys the knowledge model had as secure before this sitting:
     *  a quick miss there is read as a likely slip (lib/diagnosis.ts). */
    secureTopics?: ReadonlySet<string>;
  },
): MisconceptionCandidate[] {
  const out: MisconceptionCandidate[] = [];
  const missesSoFar = new Map<string, number>();
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
    const topicKey = normaliseTopicKey(a.topic);
    const earlier = missesSoFar.get(topicKey) ?? 0;
    missesSoFar.set(topicKey, earlier + 1);
    const prerequisite = prerequisiteFor(a.topic);
    const diagnosis = diagnoseWrongAnswer({
      namedBelief: match.kind !== "generic",
      confidence: a.confidence,
      secondsSpent: a.secondsSpent,
      topicSecure: Boolean(topicKey && ctx.secureTopics?.has(topicKey)),
      earlierMissesThisSitting: earlier,
      hasPrerequisites: prerequisite !== null,
      workedSolution: a.workedSolution,
    });
    /* A likely slip on a topic the student has shown they know: the miss
       still counts in the knowledge model, but it is not a belief. */
    if (diagnosis.severity === null) continue;
    const repair = repairFor(match, a);
    const common = {
      subject: ctx.subject,
      severity: diagnosis.severity,
      tool: "quiz" as const,
      kind: "evidence" as const,
      detail:
        (a.workedSolution
          ? `Needed the worked solution for "${a.question}".`
          : a.chosen
            ? `Chose "${a.chosen}".`
            : `Left "${a.question}" unanswered.`) +
        (diagnosis.checkPrerequisite && prerequisite
          ? ` Second miss on ${a.topic} in this sitting: check ${prerequisite} first.`
          : ""),
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

/** The title of the first syllabus prerequisite of the spec topic a label
 *  names, or null when it names none or has no prerequisite. */
export function prerequisiteFor(topic: string): string | null {
  const hit = topic ? seededMatch(topic) : null;
  const ref = hit?.topic.prerequisites?.[0];
  if (!hit || !ref) return null;
  return hit.spec.topics.find((t) => t.ref === ref)?.title ?? null;
}
