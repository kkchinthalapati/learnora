import { Link } from "react-router";
import { MasteryLadder } from "../../components/learning/MasteryLadder";
import type { Exam } from "../../api/types";
import { localDateStr } from "../../lib/date";
import { topicMastery } from "../../lib/mastery";
import { WEEKLY_GOAL_DAYS, weekDates } from "../../lib/todayPlan";
import type { TopicState } from "../../lib/trajectory";
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

/* Context, not action: where each topic stands and how the week is going.
   Nothing here competes with the lead card's button. */
export function TodayRail({
  exam,
  topics,
  studiedDates,
  showWeek,
  now = new Date(),
}: {
  exam: Exam | null;
  topics: TopicState[];
  /** Local dates (YYYY-MM-DD) with any study session or quiz. */
  studiedDates: Set<string>;
  /** Experimental weekly goal (lib/flags `weeklyGoal`). */
  showWeek: boolean;
  now?: Date;
}) {
  const shown = [...topics].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const week = weekDates(now);
  const today = localDateStr(now);
  const studied = week.filter((d) => studiedDates.has(d)).length;

  if (shown.length === 0 && !showWeek) return null;

  return (
    <aside className={styles.rail} aria-label="Where you stand">
      {shown.length > 0 ? (
        <section className={styles.railSection} aria-labelledby="rail-exam">
          <div className={styles.railHead}>
            <h2 id="rail-exam" className={styles.railTitle}>
              {exam?.exam_name ?? "Your topics"}
            </h2>
            <Link to="/analytics" className={styles.inlineLink}>
              Progress
            </Link>
          </div>
          <div className={styles.ladders}>
            {shown.map((t) => {
              const m = topicMastery(t);
              return (
                <MasteryLadder
                  key={t.id}
                  topic={t.label}
                  rung={m.rung}
                  fading={m.fading}
                  size="sm"
                />
              );
            })}
          </div>
          <p className={styles.caption}>
            Seen → Recalled → Applied → Explained. Each step needs evidence
            from a check, not time spent.
          </p>
        </section>
      ) : null}

      {showWeek ? (
        <section className={styles.railSection} aria-labelledby="rail-week">
          <h2 id="rail-week" className={styles.railTitle}>
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
    </aside>
  );
}
