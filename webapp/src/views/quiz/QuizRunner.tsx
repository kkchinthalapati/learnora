import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";
import { useQuiz, useRecordQuizAttempt } from "../../hooks/useQuizzes";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
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
        <h1>Quiz not found.</h1>
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
          <h1>{quiz.title || "Quiz"}</h1>
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

function QuizSession({
  quizId,
  questions,
}: {
  quizId: string;
  questions: QuizQuestion[];
}) {
  const recordAttempt = useRecordQuizAttempt();
  const { showToast } = useToast();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [answered, setAnswered] = useState<Answered | null>(null);

  const finished = index >= questions.length;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  /* The attempt is written once, when the run ends. Fire-and-forget on
     purpose: the student already finished, so the completion screen must not
     wait on the network — but a failure is surfaced, because weak-topic
     tracking silently stops working otherwise (js/router.js:867-875). */
  const { mutate: record } = recordAttempt;
  useEffect(() => {
    if (!finished) return;
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

  if (finished) {
    const weakTopics = weakTopicsFrom(answers);
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <QuizHost
            message={`Finished! You got ${score} out of ${total}. Check your weak topics and keep studying!`}
          />
          <ExitLink />
          <h1>Quiz Complete! 🎉</h1>
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
      },
    ]);
  };

  const next = () => {
    setAnswered(null);
    setIndex((i) => i + 1);
  };

  /* Keyboard shortcuts: 1-4 or A-D to choose answer, Enter/Space to next */
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
        <h1 className={styles.question}>{question.question}</h1>

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
