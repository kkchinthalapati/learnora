import { useState, useMemo } from "react";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useSessionsSince } from "../../hooks/useSessions";
import { useQuizAttempts } from "../../hooks/useQuizzes";
import { useFolders } from "../../hooks/useFolders";
import { useExams } from "../../hooks/useExams";
import {
  generateActivityHeatmap,
  computeHourlyDistribution,
  detectPeakFocusWindow,
  computeSubjectUrgencyMatrix,
  generateStudyInsights,
  formatHour,
  type HourlyStats,
} from "../../lib/analyticsEngine";
import { Skeleton } from "../../components/Skeleton";
import { anyPending } from "../../lib/queryState";
import { StudyHeatmap } from "./StudyHeatmap";
import styles from "./analytics.module.css";

const RANGE_OPTIONS: ReadonlyArray<{
  days: 365 | 90 | 30;
  label: string;
}> = [
  { days: 365, label: "52 Weeks (1Y)" },
  { days: 90, label: "90 Days" },
  { days: 30, label: "30 Days" },
];

export function StudyAnalyticsView() {
  const [activeRange, setActiveRange] = useState<365 | 90 | 30>(365);
  const [selectedHour, setSelectedHour] = useState<HourlyStats | null>(null);

  // Fetch 365 days of sessions for deep engine calculations
  const { data: sessions = [], isPending: sessionsPending } =
    useSessionsSince(365);
  const { data: quizAttempts = [], isPending: attemptsPending } =
    useQuizAttempts();
  const { data: folders = [], isPending: foldersPending } = useFolders();
  const { data: exams = [], isPending: examsPending } = useExams();

  /* Every stat below reads all four of these at once, so a partial load
     renders a confident, wrong screen — 0 hours, 0% consistency, an empty
     heatmap — that pops when the data lands. Gate on the aggregate the way
     ConceptGraphView does. */
  const isPending = anyPending(
    sessionsPending,
    attemptsPending,
    foldersPending,
    examsPending,
  );

  // Filter sessions according to active range if needed, or pass full 365 to heatmap
  const heatData = useMemo(() => {
    return generateActivityHeatmap(sessions, activeRange);
  }, [sessions, activeRange]);

  const hourlyStats = useMemo(() => {
    return computeHourlyDistribution(sessions, quizAttempts);
  }, [sessions, quizAttempts]);

  const peakWindow = useMemo(() => {
    return detectPeakFocusWindow(hourlyStats);
  }, [hourlyStats]);

  const subjectMatrix = useMemo(() => {
    return computeSubjectUrgencyMatrix(sessions, folders, exams);
  }, [sessions, folders, exams]);

  const aiInsights = useMemo(() => {
    return generateStudyInsights(sessions, quizAttempts, heatData, hourlyStats);
  }, [sessions, quizAttempts, heatData, hourlyStats]);

  // Derived Summary Metrics
  const totalHours = Math.floor(heatData.totalMinutes / 60);
  const remainingMins = heatData.totalMinutes % 60;
  const consistencyPercent = Math.round(
    (heatData.activeDays / activeRange) * 100,
  );

  const avgQuizScore = useMemo(() => {
    if (quizAttempts.length === 0) return null;
    const totalScore = quizAttempts.reduce(
      (acc, q) => acc + (q.total > 0 ? (q.score / q.total) * 100 : 0),
      0,
    );
    return Math.round(totalScore / quizAttempts.length);
  }, [quizAttempts]);

  // Max minutes across hours for bar chart scaling
  const maxHourlyMinutes = useMemo(() => {
    const max = Math.max(...hourlyStats.map((h) => h.totalMinutes), 0);
    return max > 0 ? max : 60;
  }, [hourlyStats]);

  // Max minutes across subjects for subject progress bars
  const maxSubjectMinutes = useMemo(() => {
    const max = Math.max(...subjectMatrix.map((s) => s.minutesStudied), 0);
    return max > 0 ? max : 60;
  }, [subjectMatrix]);

  const isPeakHour = (hour: number) => {
    const { startHour, endHour } = peakWindow;
    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    }
    // Wraps around midnight
    return hour >= startHour || hour < endHour;
  };

  if (isPending) {
    return (
      <div className={styles.container} aria-busy="true">
        <Skeleton label="Working out your study progress" height={480} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.progressToolbar}>
        <p>
          Progress from the past <strong>{activeRange} days</strong>
        </p>
        <div
          className={styles.rangeGroup}
          role="group"
          aria-label="Progress date range"
        >
          {RANGE_OPTIONS.map((rangeOption) => (
            <button
              type="button"
              key={rangeOption.days}
              className={`${styles.rangeBtn} ${
                activeRange === rangeOption.days ? styles.rangeBtnActive : ""
              }`}
              onClick={() => setActiveRange(rangeOption.days)}
              aria-pressed={activeRange === rangeOption.days}
            >
              {rangeOption.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- 1. Summary Stat Cards --------------------------------------- */}
      <div className={styles.statsGrid}>
        {/* Total Focus Time */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Study time</span>
            <div className={styles.statIconBox}>
              <Icon name="clock" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {totalHours}h {remainingMins}m
          </p>
          <div className={styles.statSub}>
            <span>{sessions.length} completed sessions</span>
            <span className={styles.statBadge}>
              +{heatData.totalMinutes}m logged
            </span>
          </div>
        </Card>

        {/* Consistency & Active Days */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Active days</span>
            <div className={styles.statIconBox}>
              <Icon name="flame" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {heatData.activeDays}{" "}
            <span
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              / {activeRange}d
            </span>
          </p>
          <div className={styles.statSub}>
            <span>{consistencyPercent}% consistency</span>
            <span className={styles.statBadge}>
              {heatData.currentStreak}d streak
            </span>
          </div>
        </Card>

        {/* Peak Focus Window */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Peak study window</span>
            <div className={styles.statIconBox}>
              <Icon name="zap" size={18} />
            </div>
          </div>
          <p className={styles.statValue} style={{ fontSize: "20px" }}>
            {peakWindow.hasData ? (
              <>
                {formatHour(peakWindow.startHour)} –{" "}
                {formatHour(peakWindow.endHour)}
              </>
            ) : (
              "—"
            )}
          </p>
          <div className={styles.statSub}>
            {peakWindow.hasData ? (
              <span className={styles.statBadge}>
                {peakWindow.label.split("(")[0].trim()}
              </span>
            ) : (
              <span>Study a few sessions and we'll spot your best time</span>
            )}
          </div>
        </Card>

        {/* Average Quiz Mastery */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Quiz average</span>
            <div className={styles.statIconBox}>
              <Icon name="target" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {avgQuizScore !== null ? `${avgQuizScore}%` : "—"}
          </p>
          <div className={styles.statSub}>
            <span>
              {quizAttempts.length} quiz attempt
              {quizAttempts.length === 1 ? "" : "s"}
            </span>
            {avgQuizScore !== null && avgQuizScore >= 80 && (
              <span
                className={styles.statBadge}
                style={{ color: "var(--success)" }}
              >
                80% or higher
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* ---- 2. Activity Heatmap Section --------------------------------- */}
      <Card variant="panel" padding="lg" className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Study activity</h3>
            <p className={styles.sectionSub}>
              Daily focus time for the past {activeRange} days
            </p>
          </div>
        </div>

        <StudyHeatmap data={heatData} />
      </Card>

      {/* ---- 3. Two-Column Grid: Peak Hours & AI Insights ----------------- */}
      <div className={styles.twoColGrid}>
        {/* Peak Focus Hour-by-Hour Bar Chart */}
        <Card
          variant="panel"
          padding="lg"
          className={`${styles.chartCard} ${styles.sectionCard}`}
        >
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Study time by hour</h3>
                <p className={styles.sectionSub}>
                  Session minutes grouped by start time
                </p>
              </div>
              <span className={styles.statBadge}>
                <Icon name="activity" size={14} /> 24 hours
              </span>
            </div>

            <div className={styles.chartContainer}>
              <div
                className={styles.barsContainer}
                role="group"
                aria-label="Hourly study distribution bar chart"
              >
                {!peakWindow.hasData && (
                  <p className={styles.chartEmptyMessage}>
                    No sessions logged yet — this fills in once you study.
                  </p>
                )}
                {hourlyStats.map((h) => {
                  const heightPercent = Math.max(
                    4,
                    Math.round((h.totalMinutes / maxHourlyMinutes) * 100),
                  );
                  const isPeak = isPeakHour(h.hour);
                  const isSelected = selectedHour?.hour === h.hour;

                  return (
                    <button
                      type="button"
                      key={`hour-${h.hour}`}
                      className={styles.barCol}
                      title={`${formatHour(h.hour)}: ${h.totalMinutes} mins (${h.sessionCount} sessions)${
                        h.avgQuizScore !== null
                          ? `, Quiz avg: ${h.avgQuizScore}%`
                          : ""
                      }`}
                      aria-label={`${formatHour(h.hour)}: ${h.totalMinutes} minutes, ${h.sessionCount} sessions${
                        h.avgQuizScore !== null
                          ? `, quiz average ${h.avgQuizScore}%`
                          : ""
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedHour(h)}
                    >
                      <div
                        className={[
                          styles.barFill,
                          isPeak ? styles.barFillPeak : null,
                          isSelected ? styles.cellLvl4 : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ height: `${heightPercent}%` }}
                      />
                      {/* Show labels every 3 hours */}
                      {h.hour % 3 === 0 && (
                        <span className={styles.barLabel}>
                          {formatHour(h.hour)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedHour && (
              <p className={styles.hourDetail} role="status">
                <strong>{formatHour(selectedHour.hour)}</strong>:{" "}
                {selectedHour.totalMinutes} minutes across{" "}
                {selectedHour.sessionCount} session
                {selectedHour.sessionCount === 1 ? "" : "s"}
                {selectedHour.avgQuizScore !== null
                  ? `, with a ${selectedHour.avgQuizScore}% quiz average.`
                  : "."}
              </p>
            )}
          </div>

          {/* Chronotype Insights Banner */}
          <div className={styles.chronotypeBanner}>
            <div className={styles.chronotypeHeader}>
              <Icon name="zap" size={16} />
              <span>{peakWindow.label}</span>
            </div>
            <p className={styles.chronotypeText}>{peakWindow.description}</p>
          </div>
        </Card>

        {/* AI Copilot Insights Card */}
        <Card
          variant="panel"
          padding="lg"
          className={`${styles.insightsCard} ${styles.sectionCard}`}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Study patterns</h3>
              <p className={styles.sectionSub}>
                Generated from session and quiz history
              </p>
            </div>
            <div className={styles.aiHeaderBadge}>
              <span className={styles.aiPulseDot} />
              <span>Generated</span>
            </div>
          </div>

          <div className={styles.insightsList}>
            {aiInsights.map((insight, idx) => (
              <div key={`insight-${idx}`} className={styles.insightItem}>
                <p className={styles.insightText}>{insight}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ---- 4. Subject Balance vs Exam Urgency Matrix ------------------- */}
      <Card variant="panel" padding="lg" className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Subject time and exam dates</h3>
            <p className={styles.sectionSub}>
              Compare logged time with upcoming exams
            </p>
          </div>
          <span className={styles.statBadge}>
            {subjectMatrix.length} subject
            {subjectMatrix.length === 1 ? "" : "s"}
          </span>
        </div>

        {subjectMatrix.length === 0 ? (
          <div className={styles.emptyMatrix}>
            <Icon
              name="folder"
              size={32}
              style={{ margin: "0 auto var(--s-2)", opacity: 0.5 }}
            />
            <p>
              No subjects yet. Add a subject in Library to compare study time.
            </p>
          </div>
        ) : (
          <div className={styles.matrixWrapper}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th className={styles.th}>Subject</th>
                  <th className={styles.th}>Study Time</th>
                  <th className={styles.th}>Distribution</th>
                  <th className={styles.th}>Upcoming Exam</th>
                  <th className={styles.th}>Days Left</th>
                  <th className={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {subjectMatrix.map((row) => {
                  const hours = Math.floor(row.minutesStudied / 60);
                  const mins = row.minutesStudied % 60;
                  const timeFormatted =
                    hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  const progressWidth = Math.round(
                    (row.minutesStudied / maxSubjectMinutes) * 100,
                  );

                  let statusClass = styles.statusBalanced;
                  if (row.status === "Exam soon") {
                    statusClass = styles.statusHighUrgency;
                  } else if (row.status === "Needs more time") {
                    statusClass = styles.statusUnderInvested;
                  }

                  return (
                    <tr key={row.folderId} className={styles.tr}>
                      <td className={styles.td}>
                        <span className={styles.subjectTag}>
                          <span
                            className={styles.subjectColorDot}
                            style={{ backgroundColor: row.color }}
                          />
                          {row.name}
                        </span>
                      </td>
                      <td className={styles.td} style={{ fontWeight: 600 }}>
                        {timeFormatted}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.progressBarContainer}>
                          <div className={styles.progressBarBg}>
                            <div
                              className={styles.progressBarFill}
                              style={{
                                width: `${Math.max(4, progressWidth)}%`,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                            }}
                          >
                            {progressWidth}%
                          </span>
                        </div>
                      </td>
                      <td className={styles.td}>
                        {row.examName ? (
                          <span>{row.examName}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>
                            None scheduled
                          </span>
                        )}
                      </td>
                      <td className={styles.td}>
                        {row.daysUntilExam !== null ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                row.daysUntilExam <= 7
                                  ? "var(--danger)"
                                  : "var(--text)",
                            }}
                          >
                            {row.daysUntilExam === 0
                              ? "Today"
                              : row.daysUntilExam === 1
                                ? "Tomorrow"
                                : `${row.daysUntilExam} days`}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.statusPill} ${statusClass}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
