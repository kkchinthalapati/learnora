import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { INTERVENTION_BLOCK_MINS, type Verdict } from "../../lib/trajectory";
import styles from "./NextHourCard.module.css";

/* What the next hour is worth, on the page a student actually opens.
 *
 * The forecast behind this is the one thing here a competitor cannot ship in a
 * sprint: it needs a spaced-repetition system that has been measuring this
 * person's memory for months, and a real timetable saying which hours they
 * genuinely have. Both existed. Both were reachable from exactly one page that
 * a student had to know to visit.
 *
 * So this card is not a summary of /trajectory — it is the answer to the
 * question the dashboard is for. Every other card here reports state: cards
 * due, streak held, exam approaching. Those all leave the student with the
 * decision. This one makes it, in marks, and starts the timer.
 *
 * It renders nothing when it would have to guess. No exam, no memory data, no
 * topic worth an hour — in each case the honest output is silence, and the
 * cards around it already handle those states better than a hedged number
 * would.
 */

/** The comparison only earns its line when the gap is big enough to change a
 *  decision. Below this, "1.3× as much" is noise dressed as insight. */
const MEANINGFUL_RATIO = 1.5;

const VERDICT: Record<
  Verdict,
  { tone: string; line: (target: number) => string }
> = {
  "on-track": {
    tone: "good",
    line: (t) => `On track for ${t}% if you keep the hours you have.`,
  },
  close: {
    tone: "warn",
    line: (t) => `${t}% is inside the margin — this week decides it.`,
  },
  "at-risk": {
    tone: "bad",
    line: (t) => `Short of ${t}% on your current hours.`,
  },
  /* Deliberately not softened. A student who is told they are "a bit behind"
     when the arithmetic says the target is gone makes worse decisions than one
     told the truth, and the alternative target is the useful half. */
  "not-enough-time": {
    tone: "bad",
    line: (t) =>
      `${t}% is out of reach in the time left — aim for the best score you can.`,
  },
};

export function NextHourCard() {
  const navigate = useNavigate();
  const { prepareFocus } = useTimer();
  const { exam, forecast, isPending } = useTrajectory();

  if (isPending) {
    return (
      <section className={styles.card} aria-busy="true">
        <Skeleton
          label="Working out what your next hour is worth"
          height={120}
        />
      </section>
    );
  }

  if (!exam || !forecast) return null;

  const [top, ...rest] = forecast.interventions;
  if (!top || top.pointsPerHour <= 0) return null;

  const worst = rest.length > 0 ? rest[rest.length - 1] : null;
  const ratio =
    worst && worst.pointsPerHour > 0
      ? top.pointsPerHour / worst.pointsPerHour
      : 0;

  const verdict = VERDICT[forecast.verdict];

  const start = () => {
    prepareFocus(INTERVENTION_BLOCK_MINS, top.label);
    void navigate("/timer");
  };

  return (
    <section className={styles.card} aria-labelledby="next-hour-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <Icon name="zap" size={13} /> What your next hour is worth
        </span>
        <button
          type="button"
          className={styles.link}
          onClick={() => void navigate("/trajectory")}
        >
          See the forecast
        </button>
      </header>

      <h2 id="next-hour-title" className={styles.headline}>
        <span className={styles.value}>
          +{top.pointsPerHour.toFixed(1)}
          <span className={styles.unit}> marks an hour</span>
        </span>
        <span className={styles.topic}>
          on {top.label}
          {top.atRisk ? (
            <span className={styles.fading}>
              <Icon name="alert-triangle" size={11} /> fading
            </span>
          ) : null}
        </span>
      </h2>

      <p className={styles.reason}>
        {ratio >= MEANINGFUL_RATIO && worst ? (
          <>
            {ratio.toFixed(1)}× what the same hour buys you on {worst.label}
            .{" "}
          </>
        ) : null}
        {top.atRisk
          ? "You knew this and are losing it, so it needs revisiting rather than relearning."
          : `You are ${Math.round(top.mastery * 100)}% solid on it now.`}
      </p>

      <footer className={styles.foot}>
        <Button size="sm" onClick={start}>
          Start {INTERVENTION_BLOCK_MINS} min on {top.label}
        </Button>
        <span className={`${styles.verdict} ${styles[verdict.tone]}`}>
          {exam.exam_name} in {forecast.daysRemaining}{" "}
          {forecast.daysRemaining === 1 ? "day" : "days"} ·{" "}
          {verdict.line(forecast.targetScore)}
        </span>
      </footer>
    </section>
  );
}
