import { useMemo } from "react";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFolders } from "../../hooks/useFolders";
import { useSessionsSince } from "../../hooks/useSessions";
import {
  computeFolderBreakdown,
  computeSparkline,
  computeStreak,
  formatFocusTime,
} from "./analytics";
import styles from "./dashboard.module.css";

export function StreakCard() {
  const { data: sessions, isPending, isError, error } = useSessionsSince(90);
  const { data: folders } = useFolders();

  const streak = useMemo(() => computeStreak(sessions ?? []), [sessions]);
  const sparkline = useMemo(() => computeSparkline(sessions ?? []), [sessions]);
  const breakdown = useMemo(
    () => computeFolderBreakdown(sessions ?? [], folders ?? []),
    [sessions, folders],
  );

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
        <span className={styles.eyebrow}>Streak</span>
        <p role="alert" className={styles.emptySm}>
          Could not load your study history. {(error as Error).message}
        </p>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card variant="elevated" className={styles.streakCard}>
        <span className={styles.eyebrow}>Streak</span>
        <p className={styles.emptySm}>
          Start your first streak today. Complete a focus session to begin.
        </p>
      </Card>
    );
  }

  const maxMins = Math.max(1, ...sparkline.map((d) => d.mins));

  return (
    <Card variant="elevated" className={styles.streakCard}>
      <span className={styles.eyebrow}>Streak</span>
      <h2 className={styles.statNumber}>
        <Icon name="flame" size={30} className={styles.statIcon} />
        {streak} <span>day{streak === 1 ? "" : "s"}</span>
      </h2>
      <div className={styles.streakBars}>
        {sparkline.map((d) => (
          <div
            key={d.key}
            className={styles.streakBarCol}
            title={formatFocusTime(d.mins)}
          >
            <div
              className={styles.streakBar}
              style={{
                height: `${Math.max(4, Math.round((d.mins / maxMins) * 40))}px`,
              }}
            />
            <span className={styles.streakBarLabel}>{d.label}</span>
          </div>
        ))}
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
    </Card>
  );
}
