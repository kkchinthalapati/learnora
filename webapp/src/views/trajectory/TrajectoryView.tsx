import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { ProGate } from "../../components/ProGate";
import { Skeleton } from "../../components/Skeleton";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { formatDuration } from "../../lib/lifeContext";
import { INTERVENTION_BLOCK_MINS, type Verdict } from "../../lib/trajectory";
import { TrajectoryChart } from "./TrajectoryChart";
import { QuizOnlyForecast } from "./QuizOnlyForecast";
import styles from "./trajectory.module.css";

/* The screen that answers "is what I'm doing going to be enough?"
 *
 * Deliberately laid out as an argument rather than a dashboard: the number
 * first, then the evidence for it, then the one thing to do about it. A grid of
 * equally-weighted stat tiles would let a student read this for thirty seconds
 * and leave without a decision, which is the failure mode of every analytics
 * screen ever built.
 *
 * The uncertainty is on the screen, not buried. A forecast without a band is a
 * lie told with a decimal point, and this one is looked at by people making
 * real decisions about their week. */

const VERDICT_COPY: Record<Verdict, { tone: string; headline: string }> = {
  "on-track": {
    tone: "good",
    headline: "You are on track. Keep the plan and this holds.",
  },
  close: {
    tone: "warn",
    headline: "This is close. A couple of well-placed hours decides it.",
  },
  "at-risk": {
    tone: "warn",
    headline: "You are short. There is still time to change that.",
  },
  "not-enough-time": {
    tone: "bad",
    headline:
      "There is not enough time left to reach that target. Aim at what you can still protect.",
  },
};

function TrajectoryBody() {
  const [examId, setExamId] = useState<number | null>(null);
  const { exam, candidates, forecast, needsMaterial, isPending } =
    useTrajectory(examId);
  const { prepareFocus } = useTimer();
  const navigate = useNavigate();

  if (isPending) {
    return (
      <div aria-busy="true" className={styles.loading}>
        <Skeleton label="Building your forecast" height={40} width="50%" />
        <Skeleton height={200} />
        <Skeleton height={140} />
      </div>
    );
  }

  if (!exam) {
    return (
      <Card as="section" variant="panel" className={styles.section}>
        <h2 className={styles.sectionTitle}>Nothing to forecast yet</h2>
        <p className={styles.sectionCopy}>
          Trajectory projects a specific exam on a specific date.{" "}
          <Link to="/exams" className={styles.link}>
            Add your next exam
          </Link>{" "}
          and this fills in.
        </p>
      </Card>
    );
  }

  /* No decks means the real engine has nothing to project from. Rather than
     stopping there, fall back to what the student does have — quiz results —
     and say plainly that it is the rougher model. An empty screen is a worse
     answer than a rough number honestly labelled. */
  if (needsMaterial || !forecast) {
    return (
      <QuizOnlyForecast examName={exam.exam_name} examDate={exam.exam_date} />
    );
  }

  const verdict = VERDICT_COPY[forecast.verdict];
  const top = forecast.interventions[0];

  const startBlock = (label: string) => {
    prepareFocus(INTERVENTION_BLOCK_MINS, label);
    void navigate("/timer");
  };

  return (
    <>
      {candidates.length > 1 ? (
        <div className={styles.picker} role="group" aria-label="Choose an exam">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.pickerBtn} ${c.id === exam.id ? styles.pickerBtnOn : ""}`}
              aria-pressed={c.id === exam.id}
              onClick={() => setExamId(c.id)}
            >
              {c.exam_name}
            </button>
          ))}
        </div>
      ) : null}

      {/* --- The number ------------------------------------------------ */}
      <Card as="section" variant="elevated" className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.heroEyebrow}>
            {exam.exam_name} · {forecast.daysRemaining}{" "}
            {forecast.daysRemaining === 1 ? "day" : "days"} away
          </span>
          <p className={styles.heroScore}>
            {forecast.projectedScore}
            <span className={styles.heroOutOf}>/100</span>
          </p>
          <p className={styles.heroBand}>
            most likely between {forecast.confidence.lower} and{" "}
            {forecast.confidence.upper}
            {forecast.confidence.evidence < 0.35
              ? " — a wide range, because there is not much review history yet"
              : ""}
          </p>
        </div>
        <p className={`${styles.verdict} ${styles[verdict.tone]}`}>
          {verdict.headline}
        </p>
      </Card>

      {/* --- The evidence ---------------------------------------------- */}
      <Card as="section" variant="panel" className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Where this is heading</h2>
            <p className={styles.sectionCopy}>
              Built from {forecast.topics.length}{" "}
              {forecast.topics.length === 1 ? "topic" : "topics"} and the{" "}
              {formatDuration(forecast.availableMins)} you actually have free
              before the exam.
            </p>
          </div>
        </div>

        <TrajectoryChart forecast={forecast} />

        <div className={styles.deltaRow}>
          <div className={styles.delta}>
            <span className={styles.deltaLabel}>If you stop here</span>
            <strong className={styles.deltaBad}>{forecast.driftScore}</strong>
            <span className={styles.deltaNote}>
              {forecast.driftScore < forecast.todayScore
                ? `down ${forecast.todayScore - forecast.driftScore} from today — memory fades whether or not you feel it`
                : "roughly where you are now"}
            </span>
          </div>
          <div className={styles.delta}>
            <span className={styles.deltaLabel}>What the plan is worth</span>
            <strong className={styles.deltaGood}>+{forecast.planValue}</strong>
            <span className={styles.deltaNote}>
              points, for hours you already have free
            </span>
          </div>
          {forecast.minsToTarget !== null ? (
            <div className={styles.delta}>
              <span className={styles.deltaLabel}>
                To reach {forecast.targetScore}
              </span>
              <strong className={styles.deltaWarn}>
                +{formatDuration(forecast.minsToTarget)}
              </strong>
              <span className={styles.deltaNote}>
                beyond what is already scheduled
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {/* --- The decision ---------------------------------------------- */}
      <Card as="section" variant="panel" className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>What the next hour is worth</h2>
            <p className={styles.sectionCopy}>
              Same hour, different topic, very different result. This is the
              part nobody works out for themselves.
            </p>
          </div>
        </div>

        {top ? (
          <p className={styles.headline}>
            One {INTERVENTION_BLOCK_MINS}-minute block on{" "}
            <strong>{top.label}</strong> is worth{" "}
            <strong>{top.points.toFixed(1)} points</strong>
            {forecast.interventions.length > 1 &&
            forecast.interventions[forecast.interventions.length - 1].points > 0
              ? ` — ${(
                  top.points /
                  forecast.interventions[forecast.interventions.length - 1]
                    .points
                ).toFixed(1)}× the same block on ${
                  forecast.interventions[forecast.interventions.length - 1]
                    .label
                }.`
              : "."}
          </p>
        ) : null}

        <ul className={styles.interventions}>
          {forecast.interventions.slice(0, 6).map((item) => (
            <li key={item.topicId} className={styles.intervention}>
              <div className={styles.interventionMain}>
                <span className={styles.interventionLabel}>
                  {item.label}
                  {item.atRisk ? (
                    <span className={styles.risk}>
                      <Icon name="alert-triangle" size={11} /> fading
                    </span>
                  ) : null}
                </span>
                <span className={styles.interventionMeta}>
                  {Math.round(item.mastery * 100)}% solid now
                </span>
              </div>
              <div
                className={styles.bar}
                aria-hidden="true"
                style={{
                  // Scaled against the best option, so the top row is always
                  // full and the comparison is between topics, not against an
                  // abstract maximum nobody can see.
                  ["--fill" as string]: `${Math.max(4, (item.points / top.points) * 100)}%`,
                }}
              />
              <span className={styles.perHour}>
                +{item.pointsPerHour.toFixed(1)}
                <span className={styles.perHourUnit}> pts/hr</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => startBlock(item.label)}
                aria-label={`Start a ${INTERVENTION_BLOCK_MINS} minute block on ${item.label}`}
              >
                Start
              </Button>
            </li>
          ))}
        </ul>

        <p className={styles.footNote}>
          A model, not a promise. It reads your review history and quiz results,
          assumes memory fades the way it has been fading for you, and assumes a
          day can only absorb so much — which is why an all-nighter moves this
          number far less than four ordinary evenings.
        </p>
      </Card>
    </>
  );
}

export function TrajectoryView() {
  return (
    <div className={styles.view}>
      <PageHeader
        eyebrow="Trajectory"
        title="The grade you are heading for"
        sub="Every topic projected forward to exam day under your study habits and timely refreshers, against the hours you actually have."
      />
      <ProGate feature="trajectory" loadingHeight={220}>
        <TrajectoryBody />
      </ProGate>
    </div>
  );
}
