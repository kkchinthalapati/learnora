import { useState, useMemo } from "react";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";
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
import { StudyHeatmap } from "./StudyHeatmap";
import styles from "./analytics.module.css";

export function StudyAnalyticsView() {
  const [activeRange, setActiveRange] = useState<365 | 90 | 30>(365);
  const [selectedHour, setSelectedHour] = useState<HourlyStats | null>(null);

  // Fetch 365 days of sessions for deep engine calculations
  const { data: sessions = [] } = useSessionsSince(365);
  const { data: quizAttempts = [] } = useQuizAttempts();
  const { data: folders = [] } = useFolders();
  const { data: exams = [] } = useExams();

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
  const consistencyPercent = Math.round((heatData.activeDays / activeRange) * 100);

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

  return (
    <div className={styles.container}>
      <PageHeader
        title="Study Analytics & Insights"
        eyebrow="ANALYTICS ENGINE"
        sub="Comprehensive breakdown of your study consistency, chronotype focus windows, and subject balance."
      />

      {/* ---- 1. Summary Stat Cards --------------------------------------- */}
      <div className={styles.statsGrid}>
        {/* Total Focus Time */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Total Focus Time</span>
            <div className={styles.statIconBox}>
              <Icon name="clock" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {totalHours}h {remainingMins}m
          </p>
          <div className={styles.statSub}>
            <span>{sessions.length} total sessions</span>
            <span className={styles.statBadge}>+{heatData.totalMinutes}m logged</span>
          </div>
        </Card>

        {/* Consistency & Active Days */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Active Consistency</span>
            <div className={styles.statIconBox}>
              <Icon name="flame" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {heatData.activeDays} <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-muted)" }}>/ {activeRange}d</span>
          </p>
          <div className={styles.statSub}>
            <span>{consistencyPercent}% consistency</span>
            <span className={styles.statBadge}>{heatData.currentStreak}d streak</span>
          </div>
        </Card>

        {/* Peak Focus Window */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Peak Chronotype</span>
            <div className={styles.statIconBox}>
              <Icon name="zap" size={18} />
            </div>
          </div>
          <p className={styles.statValue} style={{ fontSize: "20px" }}>
            {formatHour(peakWindow.startHour)} – {formatHour(peakWindow.endHour)}
          </p>
          <div className={styles.statSub}>
            <span className={styles.statBadge}>{peakWindow.label.split("(")[0].trim()}</span>
          </div>
        </Card>

        {/* Average Quiz Mastery */}
        <Card variant="panel" className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statEyebrow}>Quiz Mastery</span>
            <div className={styles.statIconBox}>
              <Icon name="target" size={18} />
            </div>
          </div>
          <p className={styles.statValue}>
            {avgQuizScore !== null ? `${avgQuizScore}%` : "—"}
          </p>
          <div className={styles.statSub}>
            <span>{quizAttempts.length} quiz attempt{quizAttempts.length === 1 ? "" : "s"}</span>
            {avgQuizScore !== null && avgQuizScore >= 80 && (
              <span className={styles.statBadge} style={{ color: "var(--success)" }}>High Mastery</span>
            )}
          </div>
        </Card>
      </div>

      {/* ---- 2. Activity Heatmap Section --------------------------------- */}
      <Card variant="panel" padding="lg">
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Study Activity Heatmap</h3>
            <p className={styles.sectionSub}>
              Visualizing daily focus distribution across the past year (52 weeks)
            </p>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className={styles.statBadge}
              style={{
                cursor: "pointer",
                border: "none",
                background: activeRange === 365 ? "var(--accent)" : "var(--surface-2)",
                color: activeRange === 365 ? "var(--accent-on)" : "var(--text-muted)",
              }}
              onClick={() => setActiveRange(365)}
            >
              52 Weeks (1Y)
            </button>
            <button
              type="button"
              className={styles.statBadge}
              style={{
                cursor: "pointer",
                border: "none",
                background: activeRange === 90 ? "var(--accent)" : "var(--surface-2)",
                color: activeRange === 90 ? "var(--accent-on)" : "var(--text-muted)",
              }}
              onClick={() => setActiveRange(90)}
            >
              90 Days
            </button>
          </div>
        </div>

        <StudyHeatmap data={heatData} />
      </Card>

      {/* ---- 3. Two-Column Grid: Peak Hours & AI Insights ----------------- */}
      <div className={styles.twoColGrid}>
        {/* Peak Focus Hour-by-Hour Bar Chart */}
        <Card variant="panel" padding="lg" className={styles.chartCard}>
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Peak Performance Hours</h3>
                <p className={styles.sectionSub}>
                  24-hour study density with highlighted chronotype peak
                </p>
              </div>
              <span className={styles.statBadge}>
                <Icon name="activity" size={14} /> 24h Distribution
              </span>
            </div>

            <div className={styles.chartContainer}>
              <div className={styles.barsContainer} role="img" aria-label="Hourly study distribution bar chart">
                {hourlyStats.map((h) => {
                  const heightPercent = Math.max(4, Math.round((h.totalMinutes / maxHourlyMinutes) * 100));
                  const isPeak = isPeakHour(h.hour);
                  const isSelected = selectedHour?.hour === h.hour;

                  return (
                    <div
                      key={`hour-${h.hour}`}
                      className={styles.barCol}
                      title={`${formatHour(h.hour)}: ${h.totalMinutes} mins (${h.sessionCount} sessions)${
                        h.avgQuizScore !== null ? `, Quiz avg: ${h.avgQuizScore}%` : ""
                      }`}
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
                        <span className={styles.barLabel}>{formatHour(h.hour)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
        <Card variant="panel" padding="lg" className={styles.insightsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>AI Study Copilot Insights</h3>
              <p className={styles.sectionSub}>
                Synthesized actionable observations & cognitive strategies
              </p>
            </div>
            <div className={styles.aiHeaderBadge}>
              <span className={styles.aiPulseDot} />
              <span>AI Engine Active</span>
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
      <Card variant="panel" padding="lg">
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Subject Balance & Exam Urgency Matrix</h3>
            <p className={styles.sectionSub}>
              Balancing your study allocation against approaching examination deadlines
            </p>
          </div>
          <span className={styles.statBadge}>
            {subjectMatrix.length} Subject{subjectMatrix.length === 1 ? "" : "s"} Tracked
          </span>
        </div>

        {subjectMatrix.length === 0 ? (
          <div className={styles.emptyMatrix}>
            <Icon name="folder" size={32} style={{ margin: "0 auto var(--s-2)", opacity: 0.5 }} />
            <p>No subjects found. Create subjects in your Library to track allocation matrix.</p>
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
                  if (row.status === "High Urgency") {
                    statusClass = styles.statusHighUrgency;
                  } else if (row.status === "Under-invested") {
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
                              style={{ width: `${Math.max(4, progressWidth)}%` }}
                            />
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {progressWidth}%
                          </span>
                        </div>
                      </td>
                      <td className={styles.td}>
                        {row.examName ? (
                          <span>{row.examName}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>None scheduled</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        {row.daysUntilExam !== null ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color: row.daysUntilExam <= 7 ? "var(--danger)" : "var(--text)",
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
