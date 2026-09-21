import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import type { Exam } from "../../api/types";
import { INTERVENTION_BLOCK_MINS, masteryLevel, type TrajectoryForecast } from "../../lib/trajectory";
import { getGradeScale, normaliseScore, renderGrade } from "../../lib/gradeScale";
import { chooseNextStep } from "../../lib/nextStep";
import styles from "./today.module.css";

export function TodayHero({ exam, forecast, needsMaterial, isPending, dueCards = 0, onStart, onCreate }: {
  exam: Exam | null;
  forecast: TrajectoryForecast | null;
  needsMaterial: boolean;
  isPending: boolean;
  /** Cards due right now in the top topic's deck, counted by the caller. */
  dueCards?: number;
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
  /* Which topic is worth the hour is `forecast`'s answer; what to *do* with
     the hour is this one. Today used to stop at the topic and hand over a
     stopwatch, which leaves the student who did not know how to revise it
     exactly where they started. Topic-level evidence when we have it, the
     forecast's overall figure when the topic is not in the set — and when
     there is no set at all, which a forecast assembled by something other
     than `buildForecast` can still hand us. This is the root route; it does
     not get to white-screen over a missing array. */
  const evidence =
    forecast.topics?.find((t) => t.id === top.topicId)?.evidence ??
    forecast.confidence.evidence;
  const step = chooseNextStep({ label: top.label, topicId: top.topicId, mastery: top.mastery, evidence, dueCards });
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
      <p className={styles.reason}>{step.why}</p>
      <div className={styles.heroActions}>
        {step.to ? (
          <Link to={step.to} className={styles.stepLink}>{step.action}</Link>
        ) : (
          <Button variant="primary" size="md" onClick={() => onStart(top.topicId, top.label)}>{step.action}</Button>
        )}
        {/* The timed block stays one click away whatever the matched method
            is: it is the only route that ends in a quick check, so a student
            who would rather just sit with the material still feeds the
            forecast by doing it. */}
        {step.to ? (
          <Button variant="secondary" size="md" onClick={() => onStart(top.topicId, top.label)}>
            Start {INTERVENTION_BLOCK_MINS} min instead
          </Button>
        ) : null}
        <Link to="/trajectory" className={styles.whyLink}>Why this?</Link>
      </div>
    </section>
  );
}
