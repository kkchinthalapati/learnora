import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { INTERVENTION_BLOCK_MINS } from "../../lib/trajectory";
import styles from "./NextHourCard.module.css";

export function NextHourCard() {
  const navigate = useNavigate();
  const { prepareFocus } = useTimer();
  const { exam, forecast, isPending } = useTrajectory();

  if (isPending) {
    return (
      <section className={styles.card} aria-busy="true">
        <Skeleton label="Working out your next study step" height={120} />
      </section>
    );
  }

  if (!exam || !forecast) return null;
  const [top] = forecast.interventions;
  if (!top || top.pointsPerHour <= 0) return null;

  const lowEvidence = forecast.confidence.evidence < 0.5;
  const start = () => {
    prepareFocus(INTERVENTION_BLOCK_MINS, top.label);
    void navigate("/timer");
  };

  return (
    <section className={styles.card} aria-labelledby="next-hour-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <Icon name="zap" size={13} /> Evidence-based next step
        </span>
        <button
          type="button"
          className={styles.link}
          onClick={() => void navigate("/trajectory")}
        >
          See the evidence
        </button>
      </header>

      <h2 id="next-hour-title" className={styles.headline}>
        <span className={styles.value}>Study {top.label} next</span>
        {top.atRisk ? (
          <span className={styles.fading}>
            <Icon name="alert-triangle" size={11} /> fading
          </span>
        ) : null}
      </h2>

      <p className={styles.reason}>
        {top.atRisk
          ? "Your recent answers suggest this topic is fading, so revisit it before relearning something new."
          : `Your recent answers put current mastery around ${Math.round(top.mastery * 100)}%.`}
        {lowEvidence
          ? " This is a low-confidence suggestion until Learnora has more attempts from you."
          : " This recommendation uses your attempts, memory strength and exam date."}
      </p>

      <footer className={styles.foot}>
        <Button size="sm" onClick={start}>
          Start {INTERVENTION_BLOCK_MINS} min on {top.label}
        </Button>
        <span className={styles.verdict}>
          {exam.exam_name} in {forecast.daysRemaining}{" "}
          {forecast.daysRemaining === 1 ? "day" : "days"} · projected range{" "}
          {Math.round(forecast.confidence.lower)}–
          {Math.round(forecast.confidence.upper)}%
        </span>
      </footer>
    </section>
  );
}
