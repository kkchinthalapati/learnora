import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import type { Exam } from "../../api/types";
import { INTERVENTION_BLOCK_MINS, masteryLevel, type TrajectoryForecast } from "../../lib/trajectory";
import { getGradeScale, normaliseScore, renderGrade } from "../../lib/gradeScale";
import styles from "./today.module.css";

export function TodayHero({ exam, forecast, needsMaterial, isPending, onStart, onCreate }: {
  exam: Exam | null;
  forecast: TrajectoryForecast | null;
  needsMaterial: boolean;
  isPending: boolean;
  onStart: (deckId: string, label: string) => void;
  onCreate?: () => void;
}) {
  if (isPending) {
    return <section className={styles.hero} aria-busy="true"><Skeleton label="Working out your next step" height={140} /></section>;
  }
  if (!exam) {
    return (
      <section className={styles.hero}>
        <h1 className={styles.headline}>Add your next exam to get a next step</h1>
        <p className={styles.reason}>Learnora works out what the next hour is worth once it knows what you are working towards.</p>
        <Link to="/exams" className={styles.primaryLink}>Add your next exam</Link>
      </section>
    );
  }
  const top = forecast?.interventions[0];
  if (needsMaterial || !forecast) {
    return (
      <section className={styles.hero}>
        <h1 className={styles.headline}>Add material for {exam.exam_name} to get a next step</h1>
        <p className={styles.reason}>Create a flashcard deck for this exam to start forecasting.</p>
        {onCreate ? <Button onClick={onCreate}>Add material</Button> : <Link to="/library" className={styles.primaryLink}>Open Library</Link>}
      </section>
    );
  }
  if (!top || top.pointsPerHour <= 0) return <section className={styles.hero}>
    <h1 className={styles.headline}>Keep your knowledge fresh</h1>
    <p className={styles.reason}>No topic currently stands out for extra study before {exam.exam_name}. Review what is due or check your forecast.</p>
    <Link to="/library/flashcards">Review due cards</Link>
  </section>;
  const scale = getGradeScale();
  const grade = (s: number) => renderGrade(normaliseScore(s), scale);
  const lower = grade(forecast.confidence.lower);
  const upper = grade(forecast.confidence.upper);
  const level = masteryLevel(top.mastery);
  return (
    <section className={styles.hero} aria-labelledby="today-hero">
      <span className={styles.eyebrow}><Icon name="zap" size={13} /> Your next hour</span>
      <h1 id="today-hero" className={styles.headline}>Study {top.label} next</h1>
      <p className={styles.reason}>
        {top.atRisk
          ? `${top.label} is fading — revisit it before it costs you on ${exam.exam_name}.`
          : `Your mastery is ${level}, and an hour here moves ${exam.exam_name} more than anywhere else.`}{" "}
        {exam.exam_name} is in {forecast.daysRemaining} {forecast.daysRemaining === 1 ? "day" : "days"}; projected{" "}
        {lower === upper ? `around ${lower}` : `${lower}–${upper}`}.
        {forecast.confidence.evidence < 0.5 ? " This estimate has limited evidence; a quick check will help refine it." : null}
      </p>
      <div className={styles.heroActions}>
        <Button variant="primary" size="md" onClick={() => onStart(top.topicId, top.label)}>
          Start {INTERVENTION_BLOCK_MINS} min on {top.label}
        </Button>
        <Link to="/trajectory" className={styles.whyLink}>Why this?</Link>
      </div>
    </section>
  );
}
