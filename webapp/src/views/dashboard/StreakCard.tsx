import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFolders } from "../../hooks/useFolders";
import { useSessionsSince } from "../../hooks/useSessions";
import {
  evaluateDailyGoalProgress,
  loadStudyGoals,
  STUDY_GOALS_EVENT,
  type StudyGoals,
} from "../../lib/achievements";
import { AchievementsModal } from "../achievements/AchievementsModal";
import {
  computeFolderBreakdown,
  computeSparkline,
  computeStreak,
  formatFocusTime,
  remoteTotals,
} from "./analytics";
import styles from "./dashboard.module.css";

export function StreakCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const [goals, setGoals] = useState<StudyGoals>(loadStudyGoals);

  const { data: sessions, isPending, isError, error } = useSessionsSince(90);
  const { data: folders } = useFolders();

  useEffect(() => {
    const handleGoalsChange = (e: Event) => {
      const customEvent = e as CustomEvent<StudyGoals>;
      if (customEvent.detail) {
        setGoals(customEvent.detail);
      } else {
        setGoals(loadStudyGoals());
      }
    };

    window.addEventListener(STUDY_GOALS_EVENT, handleGoalsChange);
    const onFocus = () => setGoals(loadStudyGoals());
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(STUDY_GOALS_EVENT, handleGoalsChange);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const streak = useMemo(() => computeStreak(sessions ?? []), [sessions]);
  const sparkline = useMemo(() => computeSparkline(sessions ?? []), [sessions]);
  const breakdown = useMemo(
    () => computeFolderBreakdown(sessions ?? [], folders ?? []),
    [sessions, folders],
  );

  const todayMins = useMemo(
    () => (sessions ? remoteTotals(sessions).today : 0),
    [sessions],
  );

  const goalProgress = useMemo(
    () => evaluateDailyGoalProgress({ todayFocusMinutes: todayMins, goals }),
    [todayMins, goals],
  );

  // SVG Progress Ring calculations
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = Math.min(100, goalProgress.minutesPercent);
  const strokeDashoffset =
    circumference - (progressPercent / 100) * circumference;

  if (isPending) {
    return (
      <Card variant="elevated" className={styles.streakCard} aria-busy="true">
        <Skeleton label="Loading your streak" height={140} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card variant="elevated" className={styles.streakCard}>
        <div className={styles.streakCardHeader}>
          <span className={styles.eyebrow}>Streak</span>
          <Chip
            tone="accent"
            onClick={() => setModalOpen(true)}
            aria-label="Open Achievements and Study Goals"
          >
            <Icon name="trophy" size={16} />
            <span>Badges</span>
          </Chip>
        </div>
        <p role="alert" className={styles.emptySm}>
          Could not load your study history. {(error as Error).message}
        </p>
        {modalOpen && (
          <AchievementsModal open onClose={() => setModalOpen(false)} />
        )}
      </Card>
    );
  }

  const maxMins = Math.max(1, ...sparkline.map((d) => d.mins));

  return (
    <Card variant="elevated" className={styles.streakCard}>
      <div className={styles.streakCardHeader}>
        <span className={styles.eyebrow}>Streak & Daily Goal</span>
        <Chip
          tone="accent"
          onClick={() => setModalOpen(true)}
          title="Open Trophy Cabinet & Goals"
          aria-label={
            sessions.length === 0
              ? "Open Achievements and Study Goals"
              : "Open Trophy Cabinet and Achievements"
          }
        >
          <Icon name="trophy" size={16} />
          <span>Badges</span>
        </Chip>
      </div>

      <div className={styles.streakMainRow}>
        <h2 className={styles.statNumber}>
          <Icon name="flame" size={30} className={styles.statIcon} />
          {streak} <span>day{streak === 1 ? "" : "s"}</span>
        </h2>

        {/* Animated SVG Progress Ring for Daily Focus Goal */}
        <div className={styles.dailyGoalRingContainer}>
          <div className={styles.svgWrapper}>
            <svg
              className={styles.goalSvgRing}
              width="56"
              height="56"
              viewBox="0 0 56 56"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily focus goal progress"
            >
              <circle
                className={styles.goalTrackRing}
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                strokeWidth="4.5"
              />
              <circle
                className={`${styles.goalProgressRing} ${
                  goalProgress.achieved ? styles.goalProgressComplete : ""
                }`}
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                strokeWidth="4.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className={styles.ringCenterIcon}>
              <Icon
                name={goalProgress.achieved ? "flame" : "clock"}
                size={16}
                className={
                  goalProgress.achieved
                    ? styles.ringIconComplete
                    : styles.ringIconActive
                }
              />
            </div>
          </div>

          <div className={styles.goalInfo}>
            <span className={styles.goalLabel}>Daily Goal</span>
            <span className={styles.goalValue}>
              {todayMins} / {goals.dailyMinutesGoal}m
            </span>
            <span
              className={`${styles.goalStatusBadge} ${
                goalProgress.achieved ? styles.goalStatusAchieved : ""
              }`}
            >
              {goalProgress.achieved
                ? "Goal Complete! 🔥"
                : `${goalProgress.minutesPercent}% done`}
            </span>
          </div>
        </div>
      </div>

      {streak === 0 ? (
        <p className={styles.streakHint}>
          Start your first streak today. Complete a focus session to begin.
        </p>
      ) : null}

      <div className={styles.streakBars}>
        {sparkline.map((d, index) => {
          const isToday = index === sparkline.length - 1;
          const tooltip = isToday
            ? `Today: ${formatFocusTime(d.mins)} logged`
            : `${d.label}: ${formatFocusTime(d.mins)} logged`;
          return (
            <div
              key={d.key}
              className={styles.streakBarCol}
              title={tooltip}
            >
              <div
                className={`${styles.streakBar} ${isToday ? styles.streakBarActive : ""}`}
                style={{
                  height: `${Math.max(4, Math.round((d.mins / maxMins) * 44))}px`,
                }}
              />
              <span className={styles.streakBarLabel}>{d.label}</span>
            </div>
          );
        })}
      </div>

      {breakdown.length > 0 ? (
        <div className={styles.folderBreakdown}>
          {breakdown.map((row) => (
            <div key={row.id} className={styles.folderRow}>
              <span>
                <span
                  className={styles.folderDot}
                  style={{ background: row.color }}
                />
                {row.name}
              </span>
              <span className={styles.folderMins}>
                {formatFocusTime(row.mins)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Mounted only while open: the modal's own data hooks (sessions,
          flashcards, quiz attempts, tasks, exams) must not fire on every
          dashboard render just because the trophy button exists, and mounting
          fresh re-reads goals saved in another tab since last open. */}
      {modalOpen && (
        <AchievementsModal open onClose={() => setModalOpen(false)} />
      )}
    </Card>
  );
}
