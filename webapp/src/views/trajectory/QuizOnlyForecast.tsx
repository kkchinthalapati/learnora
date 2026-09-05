import { Link } from "react-router";
import { Card } from "../../components/Card";
import { useStudentEvidence } from "../../hooks/useStudentEvidence";
import {
  MIN_FORECAST_QUIZZES,
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

  /* No decks, and not enough quizzing to project from. The copy names how
     many more are needed rather than saying "not enough" and stopping: a
     student who has taken three quizzes is two away from a forecast, and
     that is a much more useful thing to be told. */
  if (!forecast) {
    const taken = evidence.quizzesTaken;
    const remaining = Math.max(0, MIN_FORECAST_QUIZZES - taken);

    return (
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Not enough data yet for {examName}
        </h2>
        <p className={styles.sectionCopy}>
          {taken === 0
            ? `A forecast needs something to measure. Take ${MIN_FORECAST_QUIZZES} quizzes and this fills in.`
            : `You have taken ${taken} ${taken === 1 ? "quiz" : "quizzes"}. ${remaining} more and this fills in — forecasting off fewer would print a range too wide to plan around.`}{" "}
          You can also{" "}
          <Link to="/library" className={styles.link}>
            turn a material into a deck
          </Link>{" "}
          for the full forecast, which needs no quizzes at all.
        </p>
      </Card>
    );
  }

  const weak = formatWeakTopics(forecast);

  return (
    <Card as="section" variant="panel" className={styles.section}>
      <p className={styles.forecastEyebrow}>Learnora Forecast</p>
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

      {/* The arithmetic, in full. A forecast a student is asked to plan
          around should not be a number they have to trust — every term here
          is one they can check against their own quiz history. */}
      <details className={styles.mathDetails}>
        <summary className={styles.mathSummary}>How this is worked out</summary>
        <ul className={styles.mathList}>
          <li>
            <strong>{forecast.accuracyNow}%</strong> — your measured accuracy
            across {forecast.quizzesTaken}{" "}
            {forecast.quizzesTaken === 1 ? "quiz" : "quizzes"}.
          </li>
          <li>
            <strong>−{forecast.penalty}</strong> — {forecast.weakTopics.length}{" "}
            weak {forecast.weakTopics.length === 1 ? "topic" : "topics"} (below{" "}
            60%), at 5 points each
            {forecast.penalty === 20 ? ", capped at 20" : ""}.
          </li>
          <li>
            <strong>±{forecast.band}</strong> — the range around that figure.
          </li>
          <li>
            {forecast.accuracyNow} − {forecast.penalty} ± {forecast.band} ={" "}
            <strong>
              {forecast.predictedMin}–{forecast.predictedMax}
            </strong>
            .
          </li>
        </ul>
        <p className={styles.mathNote}>
          Confidence is a statement about how much quizzing is behind the
          number, not about how likely it is. The {forecast.daysUntilExam}{" "}
          {forecast.daysUntilExam === 1 ? "day" : "days"} until the exam are
          shown above but are not in this arithmetic — projecting what revision
          between now and then is worth is what the full deck-based forecast
          does.
        </p>
      </details>

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
