import { Link } from "react-router";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFriendsLeaderboard } from "../../hooks/useFriends";
import {
  displayName,
  initials,
  leaderboardMeta,
} from "../friends/friendMeta";
import styles from "./dashboard.module.css";

const MAX_VISIBLE = 3;

/* "Study circle" — the dashboard's window onto the Friends feature.
 *
 * Friends had no presence anywhere outside its own page: a student had to
 * already know to click "Friends" in the sidebar to see it exists, and once
 * they had friends, seeing where they stood took a second navigation every
 * time. This surfaces the same `useFriendsLeaderboard` query the Friends
 * page reads (one cache, two subscribers — no extra request) as a compact
 * top-3, so the social-comparison motivator that leaderboard is meant to be
 * is actually visible on the page a student lands on every day.
 *
 * Two content states, same shape as StreakCard/NextExamCard's
 * pending/error/empty/content ladder:
 *  - No accepted friends yet: a compact invite prompt, so the feature is
 *    discoverable from the one screen every student actually visits, not
 *    just from a sidebar label they may never click.
 *  - At least one accepted friend: top 3 by weekly minutes, self row
 *    highlighted the same way the full Friends page does, plus a link to
 *    the complete board. */
export function StudyCircleCard() {
  const { data: entries, isPending, isError, error } = useFriendsLeaderboard();

  if (isPending) {
    return (
      <Card variant="elevated" className={styles.circleCard} aria-busy="true">
        <div className={styles.cardHead}>
          <span className={styles.eyebrow}>Study circle</span>
          <Link to="/friends" className={styles.link}>
            Open →
          </Link>
        </div>
        <Skeleton label="Loading your study circle" height={88} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card variant="elevated" className={styles.circleCard}>
        <div className={styles.cardHead}>
          <span className={styles.eyebrow}>Study circle</span>
          <Link to="/friends" className={styles.link}>
            Open →
          </Link>
        </div>
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
        <div className={styles.cardHead}>
          <span className={styles.eyebrow}>Study circle</span>
          <Link to="/friends" className={styles.link}>
            Open →
          </Link>
        </div>
        <div className={styles.circleEmpty}>
          <Icon name="users" size={22} className={styles.circleEmptyIcon} />
          <p className={styles.sub}>
            Add a friend to compare focus time and streaks — nothing is
            shared until they accept.
          </p>
        </div>
      </Card>
    );
  }

  const top = entries.slice(0, MAX_VISIBLE);

  return (
    <Card variant="elevated" className={styles.circleCard}>
      <div className={styles.cardHead}>
        <span className={styles.eyebrow}>Study circle</span>
        <Link to="/friends" className={styles.link}>
          Full leaderboard →
        </Link>
      </div>
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
