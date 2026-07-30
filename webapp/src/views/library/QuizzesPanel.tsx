import { Link } from "react-router";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useQuizzes } from "../../hooks/useQuizzes";
import { formatCreatedShort } from "./libraryMeta";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

/* The Library's Quizzes tab — ports js/router.js:794-825.
 *
 * `questions_json` is `unknown` on the row type (it is free-form JSON in the
 * table), so the count is guarded rather than trusting `.length` the way the
 * vanilla's `(q.questions_json || []).length` did — a row holding an object
 * would have printed "undefined questions" there.
 *
 * Unlike the other three tabs the card is not one big link: a quiz has two
 * destinations (take it, or review the last attempt), so the title and both
 * actions are separate links instead of one wrapping the other. */
export function QuizzesPanel() {
  const { data: quizzes, isPending, isError, error } = useQuizzes();
  const { removeQuiz } = useLibraryActions();

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label="Loading your quizzes" height={180} />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your quizzes. {(error as Error).message}
      </p>
    );
  }

  if (quizzes.length === 0) {
    return (
      <EmptyState
        icon="help-circle"
        title="No quizzes yet."
        message='Use "+ Create" above to test yourself on any topic — or open a folder to quiz yourself on a specific material.'
      />
    );
  }

  return (
    <ul className={styles.grid}>
      {quizzes.map((quiz) => {
        const questions = Array.isArray(quiz.questions_json)
          ? quiz.questions_json.length
          : 0;
        return (
          <li key={quiz.id} className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Icon name="help-circle" size={18} />
              <Link to={`/quiz/${quiz.id}`} className={styles.cardTitleLink}>
                {quiz.title}
              </Link>
            </h3>
            <p className={styles.cardMeta}>
              {questions} question{questions === 1 ? "" : "s"} · Created:{" "}
              {formatCreatedShort(quiz.created_at)}
            </p>

            <div className={styles.cardFooter}>
              <Link
                to={`/quiz/${quiz.id}/review`}
                className={styles.footerLink}
              >
                Review
              </Link>
              <Link
                to={`/quiz/${quiz.id}`}
                className={`${styles.footerLink} ${styles.footerLinkPrimary}`}
              >
                Take Quiz
              </Link>
            </div>

            <div className={styles.cardActions}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Delete ${quiz.title}`}
                title="Delete quiz"
                onClick={() => void removeQuiz(quiz.id, quiz.title)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
