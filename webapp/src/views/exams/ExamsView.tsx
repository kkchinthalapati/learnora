import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useExams } from "../../hooks/useExams";
import { useExamReadiness } from "../../hooks/useExamReadiness";
import { useTranslation } from "../../hooks/useTranslation";
import { MONTH_NAMES, formatDateStr, localDateStr } from "../../lib/date";
import { getDaysRemaining } from "../../lib/examReadiness";
import type { TranslationKey } from "../../lib/i18n";
import type { Exam } from "../../api/types";
import { DayDetailModal } from "./DayDetailModal";
import { ExamModal } from "./ExamModal";
import { ExamPrepModal } from "./ExamPrepModal";
import { MAX_EXAM_BARS_PER_DAY } from "./examMeta";
import { PlanSectionNav } from "../plan/PlanSectionNav";
import styles from "./exams.module.css";

/* Exams calendar — ports index.html:877-916 + js/main.js:1651-1915.
 *
 * The month grid is derived from `viewMonth` on each render instead of being
 * rebuilt imperatively into `#calendar-days`. One consequence worth noting:
 * the vanilla mutated a shared `displayDate` with `setMonth()`, which made
 * "next month" from the 31st skip a month (Jan 31 + 1 month is Mar 3);
 * building from a year/month pair can't drift like that. */

/* Same order as WEEKDAY_NAMES (js/i18n.js's day_sun..day_sat) — only this
   calendar header translates them (index.html:907-914); the Plan view's own
   use of WEEKDAY_NAMES has no data-i18n in the vanilla, so it stays as-is. */
const WEEKDAY_KEYS: readonly TranslationKey[] = [
  "day_sun",
  "day_mon",
  "day_tue",
  "day_wed",
  "day_thu",
  "day_fri",
  "day_sat",
];

type Overlay =
  | { kind: "none" }
  | { kind: "exam"; exam: Exam | null; date: string }
  | { kind: "day"; date: string }
  | { kind: "prep"; exam: Exam };

interface MonthCell {
  day: number;
  dateStr: string;
}

function buildMonth(year: number, month: number) {
  const leadingBlanks = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: MonthCell[] = Array.from({ length: totalDays }, (_, i) => ({
    day: i + 1,
    dateStr: formatDateStr(year, month, i + 1),
  }));
  return { leadingBlanks, cells };
}

function difficultyClass(difficulty: string | null): string {
  switch ((difficulty || "Medium").toLowerCase()) {
    case "easy":
      return styles.diffEasy;
    case "hard":
      return styles.diffHard;
    default:
      return styles.diffMedium;
  }
}

interface UpcomingExamCardProps {
  exam: Exam;
  onOpenPrep: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
}

function UpcomingExamCard({ exam, onOpenPrep, onEdit }: UpcomingExamCardProps) {
  const { readiness } = useExamReadiness(exam);
  const days = Math.max(0, getDaysRemaining(exam.exam_date));
  const countdownPill =
    days === 0 ? "Today" : days === 1 ? "1 day away" : `${days} days away`;

  const prettyDate = new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString(
    undefined,
    { weekday: "short", month: "short", day: "numeric" },
  );

  const badgeClass =
    readiness?.tier === "Exam Ready"
      ? styles.badgeReady
      : readiness?.tier === "In Progress"
        ? styles.badgeProgress
        : styles.badgeGap;

  return (
    <article className={styles.upcomingCard}>
      <div className={styles.upcomingLeft}>
        <h3 className={styles.upcomingName}>{exam.exam_name}</h3>
        <div className={styles.upcomingMeta}>
          <span>{prettyDate}</span>
          <span>•</span>
          <span>{exam.difficulty || "Medium"}</span>
          <span>•</span>
          <span>{countdownPill}</span>
        </div>
      </div>

      <div className={styles.upcomingRight}>
        {readiness && (
          <span
            className={`${styles.readinessBadge} ${badgeClass}`}
            title={`Readiness: ${readiness.score}% (${readiness.tier})`}
          >
            <Icon name="brain" size={12} />
            {readiness.score}%
          </span>
        )}
        <button
          type="button"
          className={styles.dayItemPrepBtn}
          onClick={() => onOpenPrep(exam)}
          title="Open prep plan"
          aria-label={`Open prep plan for ${exam.exam_name}`}
        >
          <Icon name="compass" size={14} />
          Prep plan
        </button>
        <button
          type="button"
          className={styles.editExamButton}
          onClick={() => onEdit(exam)}
          aria-label={`Edit ${exam.exam_name}`}
        >
          <Icon name="pencil" size={15} />
        </button>
      </div>
    </article>
  );
}

export function ExamsView() {
  const { data: exams, isPending, isError, error } = useExams();
  const t = useTranslation();
  const today = localDateStr();
  const now = new Date();
  const [viewMonth, setViewMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });

  const { leadingBlanks, cells } = useMemo(
    () => buildMonth(viewMonth.year, viewMonth.month),
    [viewMonth],
  );

  /* One pass over the exams instead of `cachedExams.filter()` per cell, which
     the vanilla ran 28-31 times per render. */
  const byDate = useMemo(() => {
    const map = new Map<string, Exam[]>();
    for (const exam of exams ?? []) {
      const list = map.get(exam.exam_date);
      if (list) list.push(exam);
      else map.set(exam.exam_date, [exam]);
    }
    return map;
  }, [exams]);

  const upcomingExams = useMemo(() => {
    return (exams ?? [])
      .filter(
        (e) =>
          (e.status || "Scheduled").toLowerCase() !== "completed" &&
          e.exam_date >= today,
      )
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  }, [exams, today]);

  function shiftMonth(delta: number) {
    setViewMonth(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function onCellActivate(dateStr: string) {
    const forDate = byDate.get(dateStr) ?? [];
    setOverlay(
      forDate.length > 0
        ? { kind: "day", date: dateStr }
        : { kind: "exam", exam: null, date: dateStr },
    );
  }

  const closeOverlay = () => setOverlay({ kind: "none" });
  const dayExams =
    overlay.kind === "day" ? (byDate.get(overlay.date) ?? []) : [];

  return (
    <div className={styles.view}>
      <PlanSectionNav />

      {!isPending && upcomingExams.length > 0 && (
        <section
          className={styles.upcomingSection}
          aria-labelledby="upcoming-exams-title"
        >
          <div className={styles.upcomingTitleRow}>
            <div>
              <p className={styles.sectionLabel}>Next deadlines</p>
              <h2 id="upcoming-exams-title">Upcoming exams</h2>
            </div>
          </div>
          <div className={styles.upcomingGrid}>
            {upcomingExams.map((exam) => (
              <UpcomingExamCard
                key={exam.id}
                exam={exam}
                onOpenPrep={(selectedExam) =>
                  setOverlay({ kind: "prep", exam: selectedExam })
                }
                onEdit={(selectedExam) =>
                  setOverlay({
                    kind: "exam",
                    exam: selectedExam,
                    date: selectedExam.exam_date,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <Card variant="panel" padding="lg" className={styles.container}>
        <div className={styles.toolbar}>
          <div className={styles.monthNav}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Previous Month"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            {/* aria-live so a month change is announced; the vanilla just
                rewrote the heading silently. */}
            <h2 aria-live="polite">
              {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
            </h2>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Next Month"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <Button
            variant="primary"
            onClick={() =>
              setOverlay({ kind: "exam", exam: null, date: today })
            }
          >
            + Add exam
          </Button>
        </div>

        <p className={styles.hint}>
          Select a day to add an exam. Select an exam label to edit it.
        </p>

        {isError && (
          <p role="alert" className={styles.hint}>
            Could not load your exams. {(error as Error).message}
          </p>
        )}

        {isPending ? (
          <div aria-busy="true">
            <Skeleton label="Loading your calendar" height={320} />
          </div>
        ) : (
          <div className={styles.calendarScroll}>
            <div className={styles.weekdays} aria-hidden="true">
              {WEEKDAY_KEYS.map((key) => (
                <div key={key}>{t(key)}</div>
              ))}
            </div>

            <div className={styles.daysGrid}>
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <div
                  key={`blank-${i}`}
                  className={`${styles.cell} ${styles.empty}`}
                  aria-hidden="true"
                />
              ))}

              {cells.map(({ day, dateStr }) => {
                const forDate = byDate.get(dateStr) ?? [];
                const isPastDate = dateStr < today;
                const overflow = forDate.length - MAX_EXAM_BARS_PER_DAY;

                return (
                  <div
                    key={dateStr}
                    className={`${styles.cell}${dateStr === today ? ` ${styles.today}` : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${MONTH_NAMES[viewMonth.month]} ${day}, ${viewMonth.year}`}
                    onClick={(e) => {
                      /* An exam bar handles its own click; without this the
                         cell would also fire and open the day list on top. */
                      if ((e.target as HTMLElement).closest("button")) return;
                      onCellActivate(dateStr);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCellActivate(dateStr);
                      }
                    }}
                  >
                    <span className={styles.dayNumber}>{day}</span>

                    {forDate.slice(0, MAX_EXAM_BARS_PER_DAY).map((exam) => {
                      const completed =
                        (exam.status || "Scheduled").toLowerCase() ===
                        "completed";
                      const classes = [
                        styles.examBar,
                        difficultyClass(exam.difficulty),
                        isPastDate && !completed ? styles.isPast : null,
                        completed ? styles.statusCompleted : null,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          key={exam.id}
                          type="button"
                          className={classes}
                          onClick={() =>
                            setOverlay({ kind: "exam", exam, date: dateStr })
                          }
                        >
                          {exam.exam_name}
                        </button>
                      );
                    })}

                    {overflow > 0 && (
                      <div className={styles.overflowBadge}>
                        +{overflow} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Keyed on what it is editing so every open starts from that exam's
          values rather than the previous one's — the vanilla did this by
          reassigning each field on open. */}
      {overlay.kind === "exam" && (
        <ExamModal
          key={overlay.exam?.id ?? `new-${overlay.date}`}
          open
          exam={overlay.exam}
          initialDate={overlay.date}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === "day" && (
        <DayDetailModal
          open
          dateStr={overlay.date}
          exams={dayExams}
          onClose={closeOverlay}
          onEditExam={(exam) =>
            setOverlay({ kind: "exam", exam, date: exam.exam_date })
          }
          onAddExam={() =>
            setOverlay({ kind: "exam", exam: null, date: overlay.date })
          }
          onOpenPrepRoadmap={(exam) => setOverlay({ kind: "prep", exam })}
        />
      )}

      {overlay.kind === "prep" && (
        <ExamPrepModal open exam={overlay.exam} onClose={closeOverlay} />
      )}
    </div>
  );
}
