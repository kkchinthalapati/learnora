import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFriendsLeaderboard } from "../../hooks/useFriends";
import { DashboardCardHeader } from "./DashboardCardHeader";
import {
  displayName,
  initials,
  leaderboardMeta,
} from "../friends/friendMeta";
import styles from "./dashboard.module.css";

const MAX_VISIBLE = 3;

export function StudyCircleCard() {
  const { data: entries, isPending, isError, error } = useFriendsLeaderboard();

  if (isPending) {
    return (
      <Card variant="elevated" className={styles.circleCard} aria-busy="true">
        <DashboardCardHeader
          eyebrow="Study circle"
          action={{ to: "/friends", label: "Open" }}
        />
        <Skeleton label="Loading your study circle" height={88} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card variant="elevated" className={styles.circleCard}>
        <DashboardCardHeader
          eyebrow="Study circle"
          action={{ to: "/friends", label: "Open" }}
        />
        <p role="alert" className={styles.emptySm}>
          Could not load your study circle. {(error as Error).message}
        </p>
      </Card>
    );
  }

  const friends = entries.filter((e) => !e.is_self);

  if (friends.length === 0) {
    return (
      <Card variant="elevated" className={styles.circleCard}>
        <DashboardCardHeader
          eyebrow="Study circle"
          action={{ to: "/friends", label: "Open" }}
        />
        <div className={styles.circleEmpty}>
          <Icon name="users" size={22} className={styles.circleEmptyIcon} />
          <p className={styles.sub}>
            Add a friend to compare focus time and streaks. Nothing is shared
            until they accept.
          </p>
        </div>
      </Card>
    );
  }

  const top = entries.slice(0, MAX_VISIBLE);

  return (
    <Card variant="elevated" className={styles.circleCard}>
      <DashboardCardHeader
        eyebrow="Study circle"
        action={{ to: "/friends", label: "Full leaderboard" }}
      />
      <ul className={styles.circleList}>
        {top.map((entry) => (
          <li
            key={entry.user_id}
            className={`${styles.circleRow} ${entry.is_self ? styles.circleRowSelf : ""}`}
          >
            <span className={styles.circleRank}>{entry.rank}</span>
            <span className={styles.circleAvatar} aria-hidden="true">
              {initials(entry.full_name)}
            </span>
            <span className={styles.circleMain}>
              <span className={styles.circleName}>
                {entry.is_self ? "You" : displayName(entry.full_name)}
              </span>
              <span className={styles.circleMeta}>
                {leaderboardMeta(entry.weekly_minutes, entry.streak)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
