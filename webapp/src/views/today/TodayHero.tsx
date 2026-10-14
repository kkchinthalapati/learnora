import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import type { Exam } from "../../api/types";
import type { LastStudySession } from "../../lib/continuity";
import { chooseNextStep, type StudyMethod } from "../../lib/nextStep";
import { prerequisiteFor } from "../../lib/quizMistakes";
import { bestTopicMatch } from "../../lib/topicKey";
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
import type { Misconception } from "../../lib/misconceptions";
import { isNamedPattern, mistakeTitle } from "../../lib/mistakeLoop";
import { checkBackHref, onDay } from "../../lib/checkBack";
import styles from "./today.module.css";

/** How long "short on time" means. */
export const SHORT_BLOCK_MINS = 10;

/** The new-user step: a few questions, no notes needed. */
export const FIRST_STEP_MINS = 5;

/* Named after the session each step opens (lib/nextStep). */
const METHOD_LABELS: Record<StudyMethod, string> = {
  block: "Practice",
  solve: "Explain",
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

/* Session progress segments. Decorative; the reason line says the step in
   words. */
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

/* The time chip ("8 min ▾"). It re-sizes the step — it never adds a second
   primary button. A native select, so it is a real, labelled control for
   keyboard and screen-reader users and opens the OS picker on a phone. */
function TimeChip({
  longMinutes,
  shortOnTime,
  onShortOnTime,
}: {
  longMinutes: number;
  shortOnTime: boolean;
  onShortOnTime?: (short: boolean) => void;
}) {
  const shown = shortOnTime ? SHORT_BLOCK_MINS : longMinutes;
  if (!onShortOnTime || longMinutes <= SHORT_BLOCK_MINS) {
    return <span className={styles.chip}>{shown} min</span>;
  }
  return (
    <span className={styles.chip}>
      <select
        className={styles.chipSelect}
        aria-label="How long have you got?"
        value={shortOnTime ? "short" : "long"}
        onChange={(e) => onShortOnTime(e.target.value === "short")}
      >
        <option value="short">{SHORT_BLOCK_MINS} min</option>
        <option value="long">{longMinutes} min</option>
      </select>
      <span className={styles.chipCaret} aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

/* Today 1c: one card, the same shape in every situation — eyebrow and time
   chip, a serif title, one reason, one full-width primary, at most one quiet
   alternative. Only the words change, so the student always knows where to
   look. */
function StepCard({
  eyebrow,
  chip,
  meta,
  title,
  children,
  as: As = "div",
  tone,
}: {
  /** "checkback": the 2px accent edge and --shadow-2 of a due check-back. */
  tone?: "checkback";
  eyebrow: string;
  chip?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  as?: "div" | "ol";
}) {
  const head = (
    <>
      <span className={styles.cardHead}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        {chip}
      </span>
      {meta ? <span className={styles.cardMeta}>{meta}</span> : null}
      <h2 id="today-step" className={styles.title}>
        {title}
      </h2>
    </>
  );
  if (As === "ol") {
    return (
      <div className={styles.card} data-tone={tone}>
        {head}
        <ol className={styles.fixList}>{children}</ol>
      </div>
    );
  }
  return (
    <div className={styles.card} data-tone={tone}>
      {head}
      {children}
    </div>
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
  session?: LastStudySession | null;
  /** A repaired mix-up whose check-back date has come (lib/checkBack). It
   *  becomes the next step: one minute, and the loop only closes here. */
  checkBack?: Misconception | null;
  rough?: RoughTest | null;
  shortOnTime?: boolean;
  onShortOnTime?: (short: boolean) => void;
  onStart: (deckId: string, label: string, minutes?: number) => void;
  onCreate?: () => void;
  now?: Date;
}

/* Today's lead: one card, one filled button. Which card is lib/todayPlan's
   decision; this only draws it. The greeting above it is TodayView's. */
export function TodayHero({
  exam,
  forecast,
  needsMaterial,
  isPending,
  dueCards = 0,
  totalDue = dueCards,
  session = null,
  checkBack = null,
  rough = null,
  shortOnTime = false,
  onShortOnTime,
  onStart,
  onCreate,
  now = new Date(),
}: TodayHeroProps) {
  if (isPending) {
    /* Box for box with the card below, so nothing jumps when it lands. */
    return (
      <section className={styles.lead} aria-busy="true">
        <div className={styles.card}>
          <Skeleton
            label="Working out your next step…"
            width="30%"
            height={14}
          />
          <Skeleton width="78%" height={32} radius="6px" />
          <Skeleton width="92%" height={16} />
          <Skeleton width="64%" height={16} />
          <Skeleton
            height={52}
            radius="var(--radius-md)"
            className={styles.skeletonCta}
          />
          <span className={styles.skeletonGhost} aria-hidden="true" />
        </div>
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

  /* What the chip's longer option means: the unfinished session's time left,
     or the forecast's block. */
  const chip = (
    <TimeChip
      longMinutes={session?.minutesLeft ?? INTERVENTION_BLOCK_MINS}
      shortOnTime={shortOnTime}
      onShortOnTime={onShortOnTime}
    />
  );

  /* A due check-back leads unless the student has said they're short on
     time — and even then it's one minute, so it still fits. */
  if (checkBack && !shortOnTime) {
    const belief =
      isNamedPattern(checkBack) && checkBack.summary ? checkBack.summary : mistakeTitle(checkBack);
    return (
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard
          tone="checkback"
          eyebrow="Check-back ready"
          chip={<span className={styles.chipQuiet}>1 question</span>}
          title="Prove you’ve fixed it"
        >
          <p className={styles.quote}>
            <span className={styles.quoteLabel}>
              {onDay(checkBack.repairedAt ?? checkBack.lastSeenAt, now)} you thought
            </span>
            <span>“{belief}”</span>
          </p>
          <p className={styles.reason}>Here’s a brand-new question to see if that’s changed.</p>
          <div className={styles.actions}>
            <Link to={checkBackHref(checkBack.id)} className={styles.primary}>
              Try it · 1 min
            </Link>
          </div>
        </StepCard>
        {session ? (
          <p className={styles.caption}>
            Then:{" "}
            <Link to={sessionHref(session.id, session.mode)} className={styles.inlineLink}>
              pick up {session.objective}
            </Link>
          </p>
        ) : null}
      </section>
    );
  }

  if (scenario === "returning" && session) {
    const mode = isSessionMode(session.mode)
      ? MODE_LABELS[session.mode]
      : "Study";
    return (
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard
          eyebrow="Pick up where you left off"
          chip={chip}
          meta={`${mode} session${session.subject ? ` · ${session.subject}` : ""}`}
          title={session.objective}
        >
          <SessionProgress
            step={session.stepIndex}
            total={session.totalSteps}
          />
          <p className={styles.reason}>
            You stopped at step{" "}
            {Math.min(session.stepIndex + 1, session.totalSteps)}
            {session.stepLabel ? `, ${session.stepLabel}` : ""}.
            {session.watchingFor
              ? ` Last time: ${session.watchingFor}. We'll start with a quick check on that.`
              : ""}
          </p>
          <div className={styles.actions}>
            <Link
              to={sessionHref(session.id, session.mode)}
              className={styles.primary}
            >
              Resume · {session.minutesLeft} min left
            </Link>
          </div>
          <span className={styles.caption}>Your notes and chat are saved</span>
        </StepCard>
      </section>
    );
  }

  if (scenario === "rough" && rough) {
    const fixes = rough.fixes.slice(0, 2);
    const { attempt } = rough;
    return (
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard
          as="ol"
          eyebrow="Your next step"
          title={
            <>
              {whenWord(attempt.created_at, now)} test showed us{" "}
              {COUNT_WORDS[fixes.length] ?? fixes.length}{" "}
              {fixes.length === 1 ? "thing" : "things"} to fix.
            </>
          }
        >
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
        </StepCard>
        <p className={styles.caption}>
          You got {attempt.score} of {attempt.total} right.{" "}
          <Link
            to={`/quiz/${attempt.quiz_id}/review`}
            className={styles.inlineLink}
          >
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
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard
          eyebrow="Quick recall · mixed"
          chip={chip}
          title="Ten minutes is enough to keep things from fading."
        >
          <span className={styles.detail}>
            {totalDue > 0
              ? `${totalDue} ${totalDue === 1 ? "card" : "cards"} due`
              : "A mixed check"}
            {fading ? `, plus a check on ${fading.label}` : ""}
          </span>
          <p className={styles.reason}>
            Mixed on purpose. Switching between topics is harder, and it is what
            makes recall hold up on the exam.
          </p>
          <div className={styles.actions}>
            <Link
              to={newSessionHref("recall", { minutes: SHORT_BLOCK_MINS })}
              className={styles.primary}
            >
              Start · {Math.max(minutes, 3)} min
            </Link>
          </div>
        </StepCard>
        {session ? (
          <p className={styles.caption}>
            Your {session.objective} session will still be here.{" "}
            <Link
              to={sessionHref(session.id, session.mode)}
              className={styles.inlineLink}
            >
              Resume it instead
            </Link>
          </p>
        ) : null}
      </section>
    );
  }

  if (scenario === "empty") {
    if (!exam) {
      return (
        <section className={styles.lead} aria-labelledby="today-step">
          <StepCard
            eyebrow="Your next step"
            title="Add your next exam to get a next step"
          >
            <p className={styles.reason}>
              Learnora works out what the next hour is worth once it knows what
              you are working towards. It takes about a minute.
            </p>
            <div className={styles.actions}>
              <Link to="/exams" className={styles.primary}>
                Add your next exam
              </Link>
              <Link to="/study" className={styles.ghost}>
                Practise any topic instead
              </Link>
            </div>
          </StepCard>
        </section>
      );
    }
    /* Never "Add material" as the only step: practice first, from
       questions, and the student's own notes when they have some. */
    return (
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard
          eyebrow="Your next step"
          chip={<span className={styles.chip}>{FIRST_STEP_MINS} min</span>}
          title={`Try a few questions on ${exam.exam_name}`}
        >
          <p className={styles.reason}>
            A quick start. You don't need any notes. Add yours later and
            Learnora plans with them too.
          </p>
          <div className={styles.actions}>
            <Link
              to={newSessionHref("practice", {
                topic: exam.exam_name,
                minutes: FIRST_STEP_MINS,
              })}
              className={styles.primary}
            >
              Start · {FIRST_STEP_MINS} min
            </Link>
            {onCreate ? (
              <Button
                variant="ghost"
                onClick={onCreate}
                className={styles.ghostButton}
              >
                Add material
              </Button>
            ) : (
              <Link to="/library" className={styles.ghost}>
                Open Library
              </Link>
            )}
          </div>
        </StepCard>
      </section>
    );
  }

  const top = forecast?.interventions[0];

  if (scenario === "clear" || !top || !forecast || !exam) {
    const strongest = [...(forecast?.topics ?? [])].sort(
      (a, b) => b.mastery - a.mastery,
    )[0];
    return (
      <section className={styles.lead} aria-labelledby="today-step">
        <StepCard eyebrow="Your next step" title="You're clear for today.">
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
        </StepCard>
      </section>
    );
  }

  /* scenario === "next": the forecast's topic, and chooseNextStep's method. */
  /* Checks only, like the Progress ladder: study time must not make the
     card claim a topic has been measured. */
  const topicState = forecast.topics?.find((t) => t.id === top.topicId);
  const evidence =
    topicState?.measuredEvidence ??
    topicState?.evidence ??
    forecast.confidence.evidence;
  /* The topic's syllabus prerequisite and what the student's answers say
     about it: a shaky foundation is fixed before what builds on it. */
  const prerequisiteLabel = prerequisiteFor(top.label);
  const topics = forecast.topics ?? [];
  const prerequisiteState = prerequisiteLabel
    ? topics[
        bestTopicMatch(
          prerequisiteLabel,
          topics.map((t) => t.label),
        )
      ]
    : undefined;
  const step = chooseNextStep({
    label: top.label,
    topicId: top.topicId,
    mastery: top.mastery,
    evidence,
    dueCards,
    knowledge: topicState?.knowledge ?? null,
    prerequisite: prerequisiteLabel
      ? {
          label: prerequisiteLabel,
          knowledge: prerequisiteState?.knowledge ?? null,
        }
      : null,
  });
  const rough_ = forecast.confidence.evidence < 0.5;
  const runnerUp = forecast.interventions[1];
  return (
    <section className={styles.lead} aria-labelledby="today-step">
      <StepCard
        eyebrow="Your next step"
        chip={chip}
        meta={`${METHOD_LABELS[step.method]} · ${exam.exam_name}`}
        title={`Study ${top.label} next.`}
      >
        <p className={styles.reason}>
          {top.atRisk ? `You're starting to forget ${top.label}. ` : ""}
          {step.why}
        </p>
        <div className={styles.actions}>
          {step.to ? (
            <Link to={step.to} className={styles.primary}>
              {step.action}
            </Link>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className={styles.cta}
              onClick={() => onStart(top.topicId, top.label)}
            >
              {step.action}
            </Button>
          )}
          {/* The timed block stays one click away whatever the matched
              method is: it is the only route that ends in a quick check, so
              a student who would rather sit with the material still feeds
              the forecast. */}
          {step.to ? (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => onStart(top.topicId, top.label)}
            >
              Start {INTERVENTION_BLOCK_MINS} min instead
            </button>
          ) : null}
        </div>
        {/* The reasoning is free — it used to be a link to the Pro-only
            Trajectory page. One line; the detail is behind the summary. */}
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
                hour there should move your predicted score more than any other
                topic
                {runnerUp ? ` (next: ${runnerUp.label})` : ""}.
              </li>
            ) : (
              <li>
                An hour on {top.label} adds about{" "}
                {Math.max(1, Math.round(top.pointsPerHour))}{" "}
                {Math.round(top.pointsPerHour) === 1 ? "point" : "points"} (out
                of 100) to your predicted score, more than any other topic right
                now
                {runnerUp ? ` (next best: ${runnerUp.label})` : ""}.
              </li>
            )}
            <li>
              {rough_
                ? "The prediction is rough because Learnora has only a little quiz and flashcard data from you. The check at the end makes it more accurate."
                : "The prediction comes from your recent quizzes, flashcard reviews and study time."}
            </li>
            <li>
              It updates every time you study, so this will change as you
              improve.
            </li>
            <li>Every step ends with a quick check.</li>
          </ul>
          <Link to="/trajectory" className={styles.inlineLink}>
            See the full forecast
          </Link>
        </details>
      </StepCard>
    </section>
  );
}
