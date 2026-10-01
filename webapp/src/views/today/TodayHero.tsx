import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import type { Exam } from "../../api/types";
import type { LastStudySession } from "../../lib/continuity";
import { chooseNextStep, type StudyMethod } from "../../lib/nextStep";
import {
  INTERVENTION_BLOCK_MINS,
  type TrajectoryForecast,
} from "../../lib/trajectory";
import {
  chooseTodayScenario,
  fadingTopics,
  minutesForCards,
  type RoughTest,
  type TodayScenario,
} from "../../lib/todayPlan";
import {
  isSessionMode,
  MODE_LABELS,
  newSessionHref,
  sessionHref,
} from "../../lib/sessionModes";
import text from "../../styles/text.module.css";
import styles from "./today.module.css";

/** How long "short on time" means. */
export const SHORT_BLOCK_MINS = 10;

const METHOD_LABELS: Record<StudyMethod, string> = {
  block: "Study block",
  solve: "Socratic",
  review: "Recall",
  teach: "Teach",
};

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five"];

function whenWord(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() -
      new Date(d.toDateString()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return "Today's";
  if (days === 1) return "Yesterday's";
  return "Your last";
}

/* Five segments of session progress (44×4 each in the handoff). Decorative;
   the reason line beside it says the step in words. */
function SessionProgress({ step, total }: { step: number; total: number }) {
  const count = Math.min(Math.max(total, 1), 8);
  return (
    <span className={styles.progress} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-done={i < step || undefined} />
      ))}
    </span>
  );
}

interface TodayHeroProps {
  exam: Exam | null;
  forecast: TrajectoryForecast | null;
  needsMaterial: boolean;
  isPending: boolean;
  /** Cards due right now in the top topic's deck, counted by the caller. */
  dueCards?: number;
  /** Cards due across every deck. */
  totalDue?: number;
  firstName?: string;
  session?: LastStudySession | null;
  rough?: RoughTest | null;
  shortOnTime?: boolean;
  onShortOnTime?: (short: boolean) => void;
  onStart: (deckId: string, label: string, minutes?: number) => void;
  onCreate?: () => void;
  now?: Date;
}

/* Today's lead: one headline, one card, one filled button. Which card is
   lib/todayPlan's decision; this only draws it. */
export function TodayHero({
  exam,
  forecast,
  needsMaterial,
  isPending,
  dueCards = 0,
  totalDue = dueCards,
  firstName,
  session = null,
  rough = null,
  shortOnTime = false,
  onShortOnTime,
  onStart,
  onCreate,
  now = new Date(),
}: TodayHeroProps) {
  if (isPending) {
    return (
      <section className={styles.lead} aria-busy="true">
        <Skeleton label="Working out your next step…" width="60%" height={52} />
        <Skeleton width="100%" height={168} radius="var(--r-lg)" />
        <Skeleton width="40%" height={16} />
      </section>
    );
  }

  const scenario: TodayScenario = chooseTodayScenario({
    now,
    shortOnTime,
    session,
    attempts: rough ? [rough.attempt] : [],
    misconceptions: rough ? rough.fixes : [],
    hasExam: Boolean(exam),
    needsMaterial: needsMaterial || (Boolean(exam) && !forecast),
    forecast,
    dueCards: totalDue,
    tasks: [],
  });

  const shortLink = onShortOnTime ? (
    <button
      type="button"
      className={styles.textAction}
      onClick={() => onShortOnTime(!shortOnTime)}
    >
      {shortOnTime ? "I have longer" : `Only have ${SHORT_BLOCK_MINS} minutes?`}
    </button>
  ) : null;

  if (scenario === "returning" && session) {
    const mode = isSessionMode(session.mode) ? MODE_LABELS[session.mode] : "Study";
    return (
      <section className={styles.lead} aria-labelledby="today-hero">
        <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
          {firstName
            ? `Pick up where you left off, ${firstName}.`
            : "Pick up where you left off."}
        </h1>
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <span className={text.meta}>
              {mode} session{session.subject ? ` · ${session.subject}` : ""}
            </span>
            <span className={text.claim}>{session.objective}</span>
            <SessionProgress step={session.stepIndex} total={session.totalSteps} />
            <p className={styles.reason}>
              You stopped at step {Math.min(session.stepIndex + 1, session.totalSteps)}
              {session.stepLabel ? `, ${session.stepLabel}` : ""}.
              {session.watchingFor
                ? ` Last time: ${session.watchingFor}. We'll start with a quick check on that.`
                : ""}
            </p>
          </div>
          <div className={styles.cardAction}>
            <Link to={sessionHref(session.id, session.mode)} className={styles.primary}>
              Resume · {session.minutesLeft} min left
            </Link>
            <span className={styles.caption}>Your notes and chat are saved</span>
          </div>
        </div>
      </section>
    );
  }

  if (scenario === "rough" && rough) {
    const fixes = rough.fixes.slice(0, 2);
    const { attempt } = rough;
    return (
      <section className={styles.lead} aria-labelledby="today-hero">
        <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
          {whenWord(attempt.created_at, now)} test showed us{" "}
          {COUNT_WORDS[fixes.length] ?? fixes.length}{" "}
          {fixes.length === 1 ? "thing" : "things"} to fix.
        </h1>
        <ol className={`${styles.card} ${styles.fixList}`}>
          {fixes.map((m, i) => (
            <li key={m.id} className={styles.fixRow}>
              <span className={styles.fixNumber} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={styles.fixText}>
                <span className={styles.fixTitle}>{m.concept}</span>
                <span className={styles.fixDiagnosis}>{m.summary}</span>
              </span>
              <Link
                to={newSessionHref(i === 0 ? "socratic" : "practice", {
                  topic: m.concept,
                  misconception: m.id,
                })}
                className={i === 0 ? styles.primary : styles.secondary}
              >
                {i === 0 ? "Fix this · 8 min" : "Practise · 5 min"}
              </Link>
            </li>
          ))}
        </ol>
        <p className={styles.caption}>
          You got {attempt.score} of {attempt.total} right.{" "}
          <Link to={`/quiz/${attempt.quiz_id}/review`} className={styles.inlineLink}>
            See the full results
          </Link>
        </p>
      </section>
    );
  }

  if (scenario === "short") {
    const fading = fadingTopics(forecast?.topics ?? [])[0];
    const minutes = Math.min(
      SHORT_BLOCK_MINS,
      minutesForCards(totalDue) + (fading ? 3 : 0),
    );
    return (
      <section className={styles.lead} aria-labelledby="today-hero">
        <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
          Ten minutes is enough to keep things from fading.
        </h1>
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <span className={`${text.meta} ${text.recall}`}>Quick recall · mixed</span>
            <span className={text.claim}>
              {totalDue > 0
                ? `${totalDue} ${totalDue === 1 ? "card" : "cards"} due`
                : "A mixed check"}
              {fading ? `, plus a check on ${fading.label}` : ""}
            </span>
            <p className={styles.reason}>
              Mixed on purpose. Switching between topics is harder, and it is
              what makes recall hold up on the exam.
            </p>
          </div>
          <div className={styles.cardAction}>
            <Link
              to={newSessionHref("recall", { minutes: SHORT_BLOCK_MINS })}
              className={styles.primary}
            >
              Start · {Math.max(minutes, 3)} min
            </Link>
          </div>
        </div>
        <p className={styles.caption}>
          {session ? (
            <>
              Your {session.objective} session will still be here.{" "}
              <Link to={sessionHref(session.id, session.mode)} className={styles.inlineLink}>
                Resume it instead
              </Link>
            </>
          ) : (
            shortLink
          )}
        </p>
      </section>
    );
  }

  if (scenario === "empty") {
    if (!exam) {
      return (
        <section className={styles.lead} aria-labelledby="today-hero">
          <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
            Add your next exam to get a next step
          </h1>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <p className={styles.reason}>
                Learnora works out what the next hour is worth once it knows
                what you are working towards.
              </p>
            </div>
            <div className={styles.cardAction}>
              <Link to="/exams" className={styles.primary}>
                Add your next exam
              </Link>
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.lead} aria-labelledby="today-hero">
        <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
          Add material for {exam.exam_name} to get a next step
        </h1>
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <p className={styles.reason}>
              Your notes become lessons, quizzes and flashcards. Add some for
              this exam and Learnora can plan with them.
            </p>
          </div>
          <div className={styles.cardAction}>
            {onCreate ? (
              <Button variant="primary" size="lg" onClick={onCreate}>
                Add material
              </Button>
            ) : (
              <Link to="/library" className={styles.primary}>
                Open Library
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const top = forecast?.interventions[0];

  if (scenario === "clear" || !top || !forecast || !exam) {
    const strongest = [...(forecast?.topics ?? [])].sort(
      (a, b) => b.mastery - a.mastery,
    )[0];
    return (
      <section className={styles.lead} aria-labelledby="today-hero">
        <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
          You're clear for today.
        </h1>
        <p className={styles.reason}>
          Nothing is due and no topic stands out before{" "}
          {exam?.exam_name ?? "your exam"}.
          {strongest ? (
            <>
              {" "}
              If you want a stretch:{" "}
              <Link
                to={newSessionHref("teach", { topic: strongest.label })}
                className={styles.inlineLink}
              >
                explain {strongest.label} in your own words
              </Link>
              .
            </>
          ) : null}
        </p>
      </section>
    );
  }

  /* scenario === "next": the forecast's topic, and chooseNextStep's method. */
  const evidence =
    forecast.topics?.find((t) => t.id === top.topicId)?.evidence ??
    forecast.confidence.evidence;
  const step = chooseNextStep({
    label: top.label,
    topicId: top.topicId,
    mastery: top.mastery,
    evidence,
    dueCards,
  });
  const rough_ = forecast.confidence.evidence < 0.5;
  const runnerUp = forecast.interventions[1];
  return (
    <section className={styles.lead} aria-labelledby="today-hero">
      <h1 id="today-hero" className={`${text.display} ${styles.headline}`}>
        Study {top.label} next.
      </h1>
      <div className={styles.card}>
        <div className={styles.cardBody}>
          <span className={text.meta}>
            {METHOD_LABELS[step.method]} · {exam.exam_name}
          </span>
          <span className={text.claim}>{top.label}</span>
          <p className={styles.reason}>
            {top.atRisk
              ? `You're starting to forget ${top.label}. `
              : ""}
            {step.why}
          </p>
        </div>
        <div className={styles.cardAction}>
          {step.to ? (
            <Link to={step.to} className={styles.primary}>
              {step.action}
            </Link>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => onStart(top.topicId, top.label)}
            >
              {step.action}
            </Button>
          )}
          <span className={styles.caption}>Ends with a quick check</span>
        </div>
      </div>
      <div className={styles.leadFooter}>
        {/* The timed block stays one click away whatever the matched method
            is: it is the only route that ends in a quick check, so a student
            who would rather sit with the material still feeds the forecast. */}
        {step.to ? (
          <button
            type="button"
            className={styles.textAction}
            onClick={() => onStart(top.topicId, top.label)}
          >
            Start {INTERVENTION_BLOCK_MINS} min instead
          </button>
        ) : null}
        {shortLink}
        {/* The reasoning is free — it used to be a link to the Pro-only
            Trajectory page. */}
        <details className={styles.why}>
          <summary>Why {top.label}?</summary>
          <ul>
            {/* A precise number on thin evidence ("adds about 48 points",
                with "only a little data") claims more than the model
                knows. Points are only shown once the forecast has some
                evidence behind it; until then the reason is given in words. */}
            {rough_ ? (
              <li>
                {top.label} looks like your biggest gap before this exam, so an
                hour there should move your predicted score more than any
                other topic
                {runnerUp ? ` (next: ${runnerUp.label})` : ""}.
              </li>
            ) : (
              <li>
                An hour on {top.label} adds about{" "}
                {Math.max(1, Math.round(top.pointsPerHour))}{" "}
                {Math.round(top.pointsPerHour) === 1 ? "point" : "points"} (out of
                100) to your predicted score, more than any other topic right now
                {runnerUp ? ` (next best: ${runnerUp.label})` : ""}.
              </li>
            )}
            <li>
              {rough_
                ? "The prediction is rough because Learnora has only a little quiz and flashcard data from you. The check at the end makes it more accurate."
                : "The prediction comes from your recent quizzes, flashcard reviews and study time."}
            </li>
            <li>It updates every time you study, so this will change as you improve.</li>
          </ul>
          <Link to="/trajectory" className={styles.inlineLink}>
            See the full forecast
          </Link>
        </details>
      </div>
    </section>
  );
}
