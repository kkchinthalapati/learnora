import { useEffect, type Ref } from "react";
import { Link } from "react-router";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useSettings } from "../../context/settings";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import {
  notifyDueCardsOncePerDay,
  shouldNotifyDueCards,
} from "../../lib/notifications";
import { DashboardTasksWidget } from "../tasks/DashboardTasksWidget";
import styles from "./dashboard.module.css";

type TasksCardProps = {
  taskInputRef?: Ref<HTMLInputElement>;
};

/* "Today's tasks" card — wraps Step 8's `DashboardTasksWidget` (built for
 * exactly this, per its own comment) with the "View all" link and the SRS
 * due-today reminder, ports js/main.js:2258-2294's dashboard half.
 *
 * The once-per-day browser notification (js/main.js:2241-2256) was a named
 * loose end since Step 12 — the badge below was ported, the `Notification`
 * call wasn't. Closed here: same gate (`notifyStudyReminders`, one per
 * calendar day via `localStorage`), fired from the same place the vanilla's
 * `renderDueCards()` did every time the dashboard saw a nonzero due count. */
export function TasksCard({ taskInputRef }: TasksCardProps = {}) {
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { settings } = useSettings();

  useEffect(() => {
    if (shouldNotifyDueCards(dueCount, settings.notifyStudyReminders)) {
      notifyDueCardsOncePerDay(dueCount);
    }
  }, [dueCount, settings.notifyStudyReminders]);

  return (
    <Card variant="elevated" className={styles.tasksCard}>
      <div className={styles.cardHead}>
        <span className={styles.eyebrow}>Today&apos;s tasks</span>
        <Link to="/tasks" className={styles.link}>
          View all →
        </Link>
      </div>
      <DashboardTasksWidget inputRef={taskInputRef} />
      {dueCount > 0 ? (
        <div className={styles.srsDue}>
          <span className={styles.srsDueLabel}>
            <Icon name="layers" size={15} />
            {dueCount} card{dueCount === 1 ? "" : "s"} due today
          </span>
          <Link to="/library/flashcards" className={styles.link}>
            Review now →
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
