import { Link } from "react-router";
import { Card } from "../../components/Card";
import { useStudentEvidence } from "../../hooks/useStudentEvidence";
import {
  calculateQuizForecast,
  formatWeakTopics,
} from "../../lib/quizForecast";
import styles from "./trajectory.module.css";

/* What Trajectory shows a student who quizzes but has never built a deck.
 *
 * Trajectory proper projects from flashcard memory state, so with no decks it
 * has nothing to project and used to say so and stop — an empty screen for
 * someone who may have taken twenty quizzes. That is a worse answer than a
 * rougher forecast, as long as the roughness is on the screen rather than
 * hidden, which is what the confidence figure and the note at the bottom are
 * for.
 *
 * This never competes with the real forecast: the caller renders it only when
 * `needsMaterial` is true, so when Trajectory can run, Trajectory wins. */
export function QuizOnlyForecast({
  examName,
  examDate,
}: {
  examName: string;
  examDate: string;
}) {
  const { evidence, isPending } = useStudentEvidence();
  const forecast = isPending ? null : calculateQuizForecast(evidence, examDate);

  /* No decks *and* no quiz results — genuinely nothing to go on, which is the
     message the screen carried before this existed. */
  if (!forecast) {
    return (
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Not enough to go on for {examName}
        </h2>
        <p className={styles.sectionCopy}>
          A forecast needs something to measure. Take a quiz, or{" "}
          <Link to="/library" className={styles.link}>
            turn a material into a deck
          </Link>
          , and this fills in — it gets sharper with every review and every
          quiz.
        </p>
      </Card>
    );
  }

  const weak = formatWeakTopics(forecast);

  return (
    <Card as="section" variant="panel" className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {examName}: {forecast.predictedMin}–{forecast.predictedMax}
      </h2>
      <p className={styles.sectionCopy}>
        Based on {forecast.quizzesTaken}{" "}
        {forecast.quizzesTaken === 1 ? "quiz" : "quizzes"} — you are scoring{" "}
        {forecast.accuracyNow}% right now, with {forecast.confidence}%
        confidence in that range.{" "}
        {forecast.daysUntilExam > 0
          ? `${forecast.daysUntilExam} ${forecast.daysUntilExam === 1 ? "day" : "days"} to go.`
          : forecast.daysUntilExam === 0
            ? "That is today."
            : "That exam has passed."}
      </p>

      {weak.length > 0 ? (
        <p className={styles.sectionCopy}>
          <strong>Weak:</strong> {weak.join(", ")}. Together they are costing
          you about {forecast.penalty} points in this estimate, so they are
          where the hours pay.
        </p>
      ) : null}

      {/* The limitation, stated on the screen rather than in a comment. A
          student planning around this number deserves to know it cannot see
          forgetting or the time they have left. */}
      <p className={styles.sectionCopy}>
        This is the rough version: it reads your quiz scores only, so it cannot
        model what you will forget or what your remaining study time is worth.{" "}
        <Link to="/library" className={styles.link}>
          Turn a material into a deck
        </Link>{" "}
        and you get the full forecast, which does both.
      </p>
    </Card>
  );
}
