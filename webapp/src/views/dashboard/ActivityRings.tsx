import { useMemo } from "react";
import styles from "./activityRings.module.css";

export interface ActivityRingsProps {
  focusMinutes: number;
  focusGoal: number;
  cardsReviewed: number;
  cardsGoal: number;
  tasksCompleted: number;
  tasksGoal: number;
  streakDays?: number;
}

interface RingConfig {
  id: string;
  label: string;
  value: number;
  goal: number;
  unit: string;
  radius: number;
  strokeWidth: number;
  color: string;
  dotClass: string;
}

export function ActivityRings({
  focusMinutes,
  focusGoal,
  cardsReviewed,
  cardsGoal,
  tasksCompleted,
  tasksGoal,
}: ActivityRingsProps) {
  const rings: RingConfig[] = useMemo(
    () => [
      {
        id: "focus",
        label: "Focus",
        value: focusMinutes,
        goal: Math.max(1, focusGoal),
        unit: "m",
        radius: 46,
        strokeWidth: 8,
        color: "#38bdf8",
        dotClass: styles.dotFocus,
      },
      {
        id: "cards",
        label: "Cards",
        value: cardsReviewed,
        goal: Math.max(1, cardsGoal),
        unit: "",
        radius: 34,
        strokeWidth: 8,
        color: "#34d399",
        dotClass: styles.dotCards,
      },
      {
        id: "tasks",
        label: "Tasks",
        value: tasksCompleted,
        goal: Math.max(1, tasksGoal),
        unit: "",
        radius: 22,
        strokeWidth: 8,
        color: "#fbbf24",
        dotClass: styles.dotTasks,
      },
    ],
    [
      focusMinutes,
      focusGoal,
      cardsReviewed,
      cardsGoal,
      tasksCompleted,
      tasksGoal,
    ],
  );

  const overallProgress = useMemo(() => {
    const focusP = Math.min(1, focusMinutes / Math.max(1, focusGoal));
    const cardsP = Math.min(1, cardsReviewed / Math.max(1, cardsGoal));
    const tasksP = Math.min(1, tasksCompleted / Math.max(1, tasksGoal));
    return Math.round(((focusP + cardsP + tasksP) / 3) * 100);
  }, [
    focusMinutes,
    focusGoal,
    cardsReviewed,
    cardsGoal,
    tasksCompleted,
    tasksGoal,
  ]);

  return (
    <div
      className={styles.ringsContainer}
      role="region"
      aria-label="Daily Activity Rings"
    >
      <div className={styles.svgWrap}>
        <svg viewBox="0 0 112 112" className={styles.svg} aria-hidden="true">
          {rings.map((ring) => {
            const circumference = 2 * Math.PI * ring.radius;
            const progress = Math.min(1.0, ring.value / ring.goal);
            const strokeDashoffset = circumference * (1 - progress);
            const isComplete = ring.value >= ring.goal;

            return (
              <g key={ring.id}>
                {/* Background track */}
                <circle
                  cx="56"
                  cy="56"
                  r={ring.radius}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={ring.strokeWidth}
                  className={styles.ringBg}
                />
                {/* Animated foreground ring */}
                <circle
                  cx="56"
                  cy="56"
                  r={ring.radius}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={ring.strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className={`${styles.ringFg} ${
                    isComplete ? styles.ringComplete : ""
                  }`}
                />
              </g>
            );
          })}
        </svg>
        <div
          className={styles.centerIcon}
          title={`${overallProgress}% Daily Goal Completed`}
        >
          <span>{overallProgress}%</span>
        </div>
      </div>

      <div className={styles.metricsList}>
        {rings.map((ring) => {
          const percent = Math.round((ring.value / ring.goal) * 100);
          return (
            <div key={ring.id} className={styles.metricRow}>
              <div className={styles.metricLabel}>
                <span className={`${styles.dot} ${ring.dotClass}`} />
                <span>{ring.label}</span>
              </div>
              <div className={styles.metricValue}>
                <span>
                  {ring.value}/{ring.goal}
                  {ring.unit}
                </span>
                <span className={styles.metricPercent}>({percent}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
