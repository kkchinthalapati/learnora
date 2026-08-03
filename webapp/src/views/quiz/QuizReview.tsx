import { Link, useParams } from "react-router";
import { Card } from "../../components/Card";
import { Skeleton } from "../../components/Skeleton";
import { useLatestQuizAttempt, useQuiz } from "../../hooks/useQuizzes";
import {
  answerForIndex,
  parseStoredAnswers,
  parseStoredQuestions,
} from "./quizMeta";
import { ExitLink, QUIZZES_PATH } from "./QuizRunner";
import styles from "./quiz.module.css";

/* Read-only walkthrough of the last attempt — ports js/router.js's
 * `reviewQuiz` (:948-1044). Before this existed the only way to see a correct
 * answer was to sit the quiz again.
 *
 * Both `questions_json` and `answers_json` are narrowed at the boundary (see
 * quizMeta.ts). The vanilla read both optimistically and, since every row was
 * interpolated into `innerHTML`, had to `esc()` each field on the way in; JSX
 * escapes by construction, so those calls are gone rather than translated. */

function formatTaken(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function QuizReview() {
  const { quizId = "" } = useParams();
  const quizQuery = useQuiz(quizId);
  const attemptQuery = useLatestQuizAttempt(quizId);

  if (quizQuery.isPending || attemptQuery.isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading your answers" height={220} />
      </div>
    );
  }

  if (quizQuery.isError || attemptQuery.isError) {
    const err = (quizQuery.error ?? attemptQuery.error) as Error;
    return (
      <div className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load your answers. {err.message}
        </p>
      </div>
    );
  }

  const quiz = quizQuery.data;
  if (!quiz) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <h1>Quiz not found.</h1>
      </div>
    );
  }

  const questions = parseStoredQuestions(quiz.questions_json);
  const attempt = attemptQuery.data;

  if (!attempt) {
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <ExitLink />
          <h1>{quiz.title || "Quiz"}</h1>
          <p className={styles.muted}>
            You haven&apos;t taken this quiz yet, so there are no answers to
            review.
          </p>
          <div className={styles.actions}>
            <Link
              to={`/quiz/${quiz.id}`}
              className={`${styles.actionLink} ${styles.actionLinkPrimary}`}
            >
              Take the quiz
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const answers = parseStoredAnswers(attempt.answers_json);
  const taken = formatTaken(attempt.created_at);

  return (
    <div className={styles.view}>
      <Card variant="panel" padding="lg" className={styles.panel}>
        <ExitLink />
        <h1>{quiz.title || "Quiz"} — your answers</h1>
        <p className={styles.score}>
          {attempt.score} / {attempt.total} correct
          {taken ? <span className={styles.muted}> · {taken}</span> : null}
        </p>

        <div className={styles.reviewList}>
          {questions.map((question, index) => {
            const given = answerForIndex(answers, questions, index);
            const chosenIndex = given ? given.chosenIndex : null;
            const wasCorrect = !!given?.correct;

            return (
              <article key={index} className={styles.reviewQuestion}>
                <header className={styles.reviewHead}>
                  <span className={styles.muted}>
                    Question {index + 1} of {questions.length}
                  </span>
                  <span
                    className={`${styles.verdict} ${
                      wasCorrect ? styles.verdictCorrect : styles.verdictWrong
                    }`}
                  >
                    {given
                      ? wasCorrect
                        ? "✓ Correct"
                        : "✕ Incorrect"
                      : "Not answered"}
                  </span>
                </header>
                <h2 className={styles.question}>{question.question}</h2>
                <ul className={styles.reviewChoices}>
                  {question.choices.map((choice, i) => {
                    const isCorrect = i === question.correctIndex;
                    const isChosen = i === chosenIndex;
                    const classes = [
                      styles.reviewChoice,
                      isCorrect ? styles.correctChoice : null,
                      !isCorrect && isChosen ? styles.wrongChoice : null,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    let tag = "";
                    if (isCorrect && isChosen) tag = "Your answer · correct";
                    else if (isCorrect) tag = "Correct answer";
                    else if (isChosen) tag = "Your answer";

                    return (
                      <li key={i} className={classes}>
                        <span>{choice}</span>
                        {tag ? (
                          <span className={styles.reviewTag}>{tag}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {question.feedback ? (
                  <p className={styles.reviewFeedback}>{question.feedback}</p>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className={styles.actions}>
          <Link
            to={`/quiz/${quiz.id}`}
            className={`${styles.actionLink} ${styles.actionLinkPrimary}`}
          >
            Retake quiz
          </Link>
          <Link to={QUIZZES_PATH} className={styles.actionLink}>
            Back to Quizzes
          </Link>
        </div>
      </Card>
    </div>
  );
}
