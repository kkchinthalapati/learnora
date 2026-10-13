import { Link } from "react-router";
import { localDateStr } from "../../lib/date";
import { WEEKLY_GOAL_DAYS, weekDates, type AlsoRow } from "../../lib/todayPlan";
import styles from "./today.module.css";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/* Today 1c's right rail (below the card on mobile): what comes later, and
   nothing that competes with the card's button. Readiness is deliberately
   not here — it lives on Progress. No counts in red, no badges. */
export function TodayRail({
  rows,
  hasMistakes,
  studiedDates,
  showWeek,
  now = new Date(),
}: {
  /** lib/todayPlan `alsoWorthDoing`, already filtered for the scenario. */
  rows: AlsoRow[];
  /** Whether the ledger has anything open; when it doesn't, say so calmly. */
  hasMistakes: boolean;
  /** Local dates (YYYY-MM-DD) with any study session or quiz. */
  studiedDates: Set<string>;
  /** Experimental weekly goal (lib/flags `weeklyGoal`). */
  showWeek: boolean;
  now?: Date;
}) {
  const week = weekDates(now);
  const today = localDateStr(now);
  const studied = week.filter((d) => studiedDates.has(d)).length;

  return (
    <aside className={styles.rail} aria-label="Later today">
      {rows.length > 0 ? (
        <section className={styles.listCard} aria-labelledby="today-later">
          <h2 id="today-later" className={styles.listTitle}>
            Later today
          </h2>
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.id} className={styles.listRow}>
                <span className={styles.listText}>
                  <span className={styles.listLabel}>
                    {row.kind === "recall" ? (
                      <span className={styles.srOnly}>Memory: </span>
                    ) : null}
                    {row.label}
                  </span>
                  <span className={styles.listSub}>{row.estimate}</span>
                </span>
                <Link
                  to={row.to}
                  className={styles.rowAction}
                  aria-label={`${row.action}: ${row.label}`}
                >
                  {row.action}
                  <span aria-hidden="true"> ›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasMistakes ? (
        <div className={styles.emptyNote}>
          <span className={styles.emptyTitle}>Nothing to fix yet</span>
          <span className={styles.emptyText}>
            If you mix something up, it’ll show here and we’ll help you sort it.
          </span>
        </div>
      ) : null}

      {showWeek ? (
        <section className={styles.listCard} aria-labelledby="rail-week">
          <h2 id="rail-week" className={styles.listTitle}>
            This week
          </h2>
          <ol className={styles.week}>
            {week.map((date, i) => {
              const did = studiedDates.has(date);
              const isToday = date === today;
              return (
                <li
                  key={date}
                  className={styles.day}
                  data-studied={did || undefined}
                  data-today={isToday || undefined}
                >
                  <span className={styles.dayBox} aria-hidden="true">
                    {did ? "✓" : ""}
                  </span>
                  <span aria-hidden="true">{DAY_LETTERS[i]}</span>
                  <span className={styles.srOnly}>
                    {DAY_NAMES[i]}
                    {isToday ? " (today)" : ""}: {did ? "studied" : "not yet"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className={styles.caption}>
            {studied} study {studied === 1 ? "day" : "days"} so far. Your goal
            is {WEEKLY_GOAL_DAYS}.
          </p>
        </section>
      ) : null}

      <p className={styles.note}>
        Readiness lives on{" "}
        <Link to="/analytics" className={styles.inlineLink}>
          Progress
        </Link>
        . We keep it off Today, so the first thing you see is what to do, not
        how you’re doing.
      </p>
    </aside>
  );
}
