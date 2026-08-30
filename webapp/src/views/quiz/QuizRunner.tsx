import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";
import { useDialog } from "../../context/dialog";
import { useContinuity } from "../../hooks/useContinuity";
import { useQuiz, useRecordQuizAttempt } from "../../hooks/useQuizzes";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useQuizDraft } from "../../hooks/useQuizDraft";
import { Storage } from "../../lib/storage";
import type { QuizQuestion } from "../../lib/aiJson";
import {
  parseStoredQuestions,
  weakTopicsFrom,
  type StoredAnswer,
} from "./quizMeta";
import { QuizHost, type HostTone } from "./QuizHost";
import styles from "./quiz.module.css";

/* The quiz runner — ports js/router.js's `startQuiz` (:827-945).
 *
 * The vanilla rebuilt `#quiz-content` per question with `innerHTML` and then
 * attached a listener per choice, remembering to `esc()` each string on the
 * way in. Here the question is state and JSX escapes by construction, so the
 * whole re-render/re-bind cycle and every `esc()` call disappear.
 *
 * `questions_json` is narrowed once through `parseStoredQuestions` (see
 * quizMeta.ts) rather than trusted — a stored question whose `correctIndex`
 * is out of range would otherwise mark every answer, including the right one,
 * wrong, and say nothing about it.
 *
 * Split in two so the session's hooks never sit behind a loading branch: the
 * route component resolves the quiz, `QuizSession` runs it. */

export const QUIZZES_PATH = "/library/quizzes";

export function ExitLink() {
  return (
    <Link to={QUIZZES_PATH} className={styles.exit}>
      ← Exit
    </Link>
  );
}

export function QuizRunner() {
  const { quizId = "" } = useParams();
  const { data: quiz, isPending, isError, error } = useQuiz(quizId);

  if (isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading quiz" height={220} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load this quiz. {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <h2>Quiz not found.</h2>
      </div>
    );
  }

  const questions = parseStoredQuestions(quiz.questions_json);

  /* Every question was unusable (or there were none). The vanilla would have
     rendered "Question 1 of 0" and an empty choice list. */
  if (questions.length === 0) {
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <ExitLink />
          <h2>{quiz.title || "Quiz"}</h2>
          <p className={styles.muted}>
            This quiz has no usable questions. Generating it again should fix
            it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <QuizSession
      quizId={quiz.id}
      quizTitle={quiz.title || "Quiz"}
      questions={questions}
      /* A fresh quiz is a fresh run: keying on the id resets index, answers
         and the recorded flag when the route changes between two quizzes. */
      key={quiz.id}
    />
  );
}

interface Answered {
  chosenIndex: number;
  correct: boolean;
}

interface QuizDraftState {
  index: number;
  answers: StoredAnswer[];
}

function isUsableDraft(
  draft: QuizDraftState | null,
  questionCount: number,
): draft is QuizDraftState {
  return (
    !!draft &&
    typeof draft.index === "number" &&
    draft.index >= 0 &&
    draft.index < questionCount &&
    Array.isArray(draft.answers)
  );
}

function QuizSession({
  quizId,
  quizTitle,
  questions,
}: {
  quizId: string;
  quizTitle: string;
  questions: QuizQuestion[];
}) {
  const recordAttempt = useRecordQuizAttempt();
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const { recordQuiz } = useContinuity();

  const draftKey = `learnora_quiz_draft_${quizId}`;

  /* A stale/corrupt/out-of-range draft (e.g. the quiz was regenerated with
     fewer questions since the draft was written) is treated as no draft at
     all, rather than crashing or landing on a bad index. */
  const [resumedDraft] = useState(() => {
    const stored = Storage.get<QuizDraftState>(draftKey);
    return isUsableDraft(stored, questions.length) ? stored : null;
  });

  const [index, setIndex] = useState(() => resumedDraft?.index ?? 0);
  const [answers, setAnswers] = useState<StoredAnswer[]>(
    () => resumedDraft?.answers ?? [],
  );
  const [answered, setAnswered] = useState<Answered | null>(null);

  /* When the current question went on screen — choose() stamps the elapsed
   * seconds into the stored answer, which is the Speed Demon achievement's
   * speed signal (achievements.ts consumes it via fastQuizCompleted). */
  const questionShownAt = useRef(Date.now());
  useEffect(() => {
    questionShownAt.current = Date.now();
  }, [index]);

  const finished = index >= questions.length;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  const draft = useQuizDraft<QuizDraftState>(
    draftKey,
    { index, answers },
    { enabled: !finished, warnOnUnload: !finished && answers.length > 0 },
  );

  /* Ask once, on mount, whether to keep the optimistically-resumed state or
     start fresh — rather than blocking the first render on the dialog, which
     would mean showing nothing (or a spinner) while it's up. Declining
     resets back to question 1 and drops the draft; confirming just leaves
     the already-resumed state in place. */
  useEffect(() => {
    if (!resumedDraft) return;
    let cancelled = false;
    void confirm(
      `You have an in-progress attempt at this quiz (question ${
        resumedDraft.index + 1
      } of ${questions.length}). Resume where you left off?`,
      { title: "Resume quiz?", confirmText: "Resume", cancelText: "Start Over" },
    ).then((keep) => {
      if (cancelled || keep) return;
      setIndex(0);
      setAnswers([]);
      draft.clear();
    });
    return () => {
      cancelled = true;
    };
    // Mount-only: this is a one-time prompt about the draft that was present
    // when the component first mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Feed the dashboard's "Resume Learning" card: the quiz currently in
   * progress, with the question position, becomes the pick-up-where-you-left-off
   * candidate until another activity replaces it. (The localStorage quiz draft
   * above already survives the gap on its own; this surfaces it on the
   * dashboard too.) */
  useEffect(() => {
    if (finished) return;
    recordQuiz({
      id: quizId,
      title: quizTitle,
      questionIndex: index,
      totalQuestions: questions.length,
    });
  }, [finished, index, questions.length, quizId, quizTitle, recordQuiz]);

  /* The attempt is written once, when the run ends. Fire-and-forget on
     purpose: the student already finished, so the completion screen must not
     wait on the network — but a failure is surfaced, because weak-topic
     tracking silently stops working otherwise (js/router.js:867-875). */
  const { mutate: record } = recordAttempt;
  useEffect(() => {
    if (!finished) return;
    draft.clear();
    record(
      {
        quizId,
        score,
        total,
        answers,
        weakTopics: weakTopicsFrom(answers),
      },
      {
        onError: () =>
          showToast(
            "Your score is shown above, but we couldn't save this attempt — weak-topic tracking may be affected.",
            { error: true },
          ),
      },
    );
    // Runs on the transition into "finished" only; `answers` is frozen by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* `question` is undefined once `finished` (index runs past the end) — that's
     fine, since `choose` below is only ever invoked from the keyboard-shortcut
     handlers or the choice buttons, both gated off once finished. */
  const question = questions[index];

  const choose = (chosenIndex: number) => {
    if (answered) return;
    const correct = chosenIndex === question.correctIndex;
    setAnswered({ chosenIndex, correct });
    setAnswers((prev) => [
      ...prev,
      {
        questionId: question.id ?? index,
        chosenIndex,
        correct,
        topic: question.topic,
        secondsSpent: Math.max(
          0,
          Math.round((Date.now() - questionShownAt.current) / 1000),
        ),
      },
    ]);
  };

  const next = () => {
    setAnswered(null);
    setIndex((i) => i + 1);
  };

  /* Keyboard shortcuts: 1-4 or A-D to choose answer, Enter/Space to next.
   *
   * Must be called unconditionally on every render — it sits above the
   * `if (finished)` early return below so the hook order never changes
   * between renders (a hook call after a conditional return violates the
   * Rules of Hooks: React throws "Rendered fewer hooks than expected" the
   * moment `finished` flips true). `enabled: !finished` is what actually
   * turns the shortcuts off once the quiz ends, not the early return. */
  useKeyboardShortcuts(
    {
      "1": () => !answered && choose(0),
      "2": () => !answered && choose(1),
      "3": () => !answered && choose(2),
      "4": () => !answered && choose(3),
      "a": () => !answered && choose(0),
      "b": () => !answered && choose(1),
      "c": () => !answered && choose(2),
      "d": () => !answered && choose(3),
      "Enter": () => answered && next(),
      " ": () => answered && next(),
    },
    { enabled: !finished },
  );

  if (finished) {
    const weakTopics = weakTopicsFrom(answers);
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <QuizHost
            message={`Finished! You got ${score} out of ${total}. Check your weak topics and keep studying!`}
          />
          <ExitLink />
          <h2>Quiz Complete! 🎉</h2>
          <p className={styles.score}>
            {score} / {total} correct
          </p>
          {weakTopics.length > 0 ? (
            <p className={styles.muted}>
              Topics to review: {weakTopics.join(", ")}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Link
              to={`/quiz/${quizId}/review`}
              className={`${styles.actionLink} ${styles.actionLinkPrimary}`}
            >
              <Icon name="list-checks" size={16} />
              Review answers
            </Link>
            <Link to={QUIZZES_PATH} className={styles.actionLink}>
              Back to Quizzes
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  let hostMessage = "";
  let hostTone: HostTone = null;
  if (answered) {
    hostMessage =
      question.feedback || (answered.correct ? "Correct!" : "Incorrect.");
    hostTone = answered.correct ? "correct" : "incorrect";
  } else if (index === 0) {
    hostMessage = "Welcome to the quiz. Let's see what you've got!";
  }

  return (
    <div className={styles.view}>
      <Card variant="panel" padding="lg" className={styles.panel}>
        {hostMessage ? (
          <QuizHost message={hostMessage} tone={hostTone} />
        ) : null}
        <ExitLink />
        <p className={styles.progress}>
          Question {index + 1} of {questions.length}
        </p>
        <h2 className={styles.question}>{question.question}</h2>

        <div className={styles.choices}>
          {question.choices.map((choice, i) => {
            const isCorrect = i === question.correctIndex;
            const isChosen = answered?.chosenIndex === i;
            const classes = [
              styles.choice,
              answered && isCorrect ? styles.correctChoice : null,
              answered && isChosen && !isCorrect ? styles.wrongChoice : null,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={i}
                type="button"
                className={classes}
                disabled={!!answered}
                onClick={() => choose(i)}
              >
                {choice}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className={styles.nextRow}>
            <Button variant="primary" onClick={next}>
              {index + 1 === questions.length
                ? "See results →"
                : "Next Question →"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
