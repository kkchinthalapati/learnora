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
import { DashboardCardHeader } from "./DashboardCardHeader";
import styles from "./dashboard.module.css";

type TasksCardProps = {
  taskInputRef?: Ref<HTMLInputElement>;
};

export function TasksCard({ taskInputRef }: TasksCardProps = {}) {
  const { data: dueCount, isPending } = useFlashcardsDueCount();
  const { settings } = useSettings();

  useEffect(() => {
    if (shouldNotifyDueCards(dueCount ?? 0, settings.notifyStudyReminders)) {
      notifyDueCardsOncePerDay(dueCount ?? 0);
    }
  }, [dueCount, settings.notifyStudyReminders]);

  return (
    <Card variant="elevated" className={styles.tasksCard}>
      <DashboardCardHeader
        eyebrow="Today's tasks"
        action={{ to: "/tasks", label: "View all" }}
      />
      <DashboardTasksWidget inputRef={taskInputRef} />
      {/* Suppress during the initial fetch rather than defaulting to 0 —
          otherwise every dashboard load flashes "no cards due" for a beat
          before the real count arrives (see FEATURE_BACKLOG.md's note on
          this exact class of bug, already fixed once in DailyDrillCard). */}
      {!isPending && dueCount && dueCount > 0 ? (
        <div className={styles.srsDue}>
          <span className={styles.srsDueLabel}>
            <Icon name="layers" size={15} />
            {dueCount} card{dueCount === 1 ? "" : "s"} due today
          </span>
          <Link to="/library/flashcards" className={styles.link}>
            Review now
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
