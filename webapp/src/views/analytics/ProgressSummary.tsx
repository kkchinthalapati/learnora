import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Skeleton } from "../../components/Skeleton";
import { useSessionsSince } from "../../hooks/useSessions";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useTrajectory } from "../../hooks/useTrajectory";
import { useLearningEvents } from "../../hooks/useLearningEvents";
import { nextCheckBack } from "../../lib/checkBack";
import {
  readinessFrom,
  READINESS_MIN_ANSWERS,
  type Readiness,
} from "../../lib/readiness";
import { plural } from "../../lib/plural";
import styles from "./progressSummary.module.css";

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const DAY_MS = 86_400_000;

function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} ${h === 1 ? "hour" : "hours"}${m ? ` ${m} min` : ""}`;
}

/* ---- This week: three plain lines a parent can read over a shoulder ---- */

export function ThisWeekStrip({ now = new Date() }: { now?: Date }) {
  const sessions = useSessionsSince(7);
  const { all } = useMisconceptions();

  const minutes = (sessions.data ?? []).reduce(
    (n, s) => n + Math.max(0, s.minutes ?? 0),
    0,
  );
  const fixed = all.filter(
    (m) =>
      m.status === "resolved" &&
      m.resolvedAt &&
      now.getTime() - new Date(m.resolvedAt).getTime() < 7 * DAY_MS,
  ).length;
  const ready = nextCheckBack(all, now);
  const upcoming = all
    .filter(
      (m) =>
        m.status !== "resolved" &&
        m.retestDueAt &&
        new Date(m.retestDueAt) > now,
    )
    .map((m) => m.retestDueAt!)
    .sort()[0];
  const next = ready
    ? "a check-back is ready on Today."
    : upcoming
      ? `a check-back on ${WEEKDAY.format(new Date(upcoming))}.`
      : "the next step is waiting on Today.";

  return (
    <section
      className={styles.week}
      aria-labelledby="progress-week"
      aria-busy={sessions.isPending || undefined}
    >
      <h2 id="progress-week" className={styles.weekTitle}>
        This week
      </h2>
      {sessions.isPending ? (
        <Skeleton label="Adding up this week" height={66} />
      ) : (
        <ul className={styles.weekLines}>
          <li>
            <strong>{minutesLabel(minutes)}</strong> of study in the last 7
            days.
          </li>
          <li>
            <strong>{fixed}</strong> {fixed === 1 ? "mistake" : "mistakes"}{" "}
            corrected, and proved right days later.
          </li>
          <li>
            Next: {next}{" "}
            <Link to="/" className={styles.link}>
              Go to Today
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}

/* ---- Readiness: a range, its basis, and what to do about it ---------- */

export function ReadinessCard() {
  const { exam, forecast, isPending } = useTrajectory();
  const events = useLearningEvents();
  const readiness = useMemo<Readiness>(
    () => readinessFrom(forecast, events.data ?? []),
    [forecast, events.data],
  );
  const [table, setTable] = useState(false);
  const tableId = useId();

  if (isPending || events.isPending) {
    return (
      <section className={styles.card} aria-busy="true" aria-label="Readiness">
        <Skeleton label="Working out your readiness" height={140} />
      </section>
    );
  }
  if (!exam) return null;

  return (
    <section className={styles.card} aria-labelledby="progress-ready">
      <p className={styles.eyebrow}>Readiness · {exam.exam_name}</p>
      {readiness.insufficient ? (
        <>
          <h2 id="progress-ready" className={styles.headline}>
            Not enough to go on yet
          </h2>
          <p className={styles.text}>
            We’d rather wait than guess. After about {READINESS_MIN_ANSWERS}{" "}
            checked answers we can show a range you can trust.
          </p>
          <div
            className={styles.counter}
            role="img"
            aria-label={`${Math.min(readiness.answers, readiness.needed)} of ${readiness.needed} checked answers so far`}
          >
            {Array.from({ length: readiness.needed }, (_, i) => (
              <span key={i} data-done={i < readiness.answers || undefined} />
            ))}
          </div>
          <p className={styles.caption}>
            {Math.min(readiness.answers, readiness.needed)} of{" "}
            {readiness.needed} so far. Untested topics count as untested, not as
            weak.
          </p>
        </>
      ) : (
        <>
          <h2 id="progress-ready" className={styles.headline}>
            Likely {readiness.likely[0]}–{readiness.likely[1]} out of 100
          </h2>
          <div
            className={styles.band}
            role="img"
            aria-label={`Likely between ${readiness.likely[0]} and ${readiness.likely[1]} out of 100. Possibly between ${readiness.possible[0]} and ${readiness.possible[1]}.`}
          >
            <span
              className={styles.possible}
              style={{
                left: `${readiness.possible[0]}%`,
                width: `${readiness.possible[1] - readiness.possible[0]}%`,
              }}
            />
            <span
              className={styles.likely}
              style={{
                left: `${readiness.likely[0]}%`,
                width: `${readiness.likely[1] - readiness.likely[0]}%`,
              }}
            />
          </div>
          <div className={styles.scale} aria-hidden="true">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <button
            type="button"
            className={styles.tableToggle}
            aria-expanded={table}
            aria-controls={tableId}
            onClick={() => setTable((t) => !t)}
          >
            {table ? "Hide the table" : "Show as a table"}
          </button>
          {table ? (
            <table id={tableId} className={styles.table}>
              <caption className={styles.srOnly}>
                Readiness range for {exam.exam_name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Band</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Likely</th>
                  <td>{readiness.likely[0]}</td>
                  <td>{readiness.likely[1]}</td>
                </tr>
                <tr>
                  <th scope="row">Possible</th>
                  <td>{readiness.possible[0]}</td>
                  <td>{readiness.possible[1]}</td>
                </tr>
              </tbody>
            </table>
          ) : null}
          <p className={styles.text}>
            Based on {plural(readiness.answers, "checked answer")} and your
            flashcard reviews.
            {readiness.updatedAt
              ? ` Updated after ${WEEKDAY.format(new Date(readiness.updatedAt))}’s practice.`
              : ""}
          </p>
          {readiness.bestMove ? (
            <p className={styles.best}>
              <span className={styles.bestLabel}>Best move</span> Practise{" "}
              {readiness.bestMove}.{" "}
              <Link to="/" className={styles.link}>
                Start it on Today
              </Link>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
