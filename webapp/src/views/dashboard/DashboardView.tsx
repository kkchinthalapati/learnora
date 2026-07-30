import { NextExamCard } from "./NextExamCard";
import { FocusCard } from "./FocusCard";
import { StreakCard } from "./StreakCard";
import { TasksCard } from "./TasksCard";
import { AIActionsCard } from "./AIActionsCard";
import { OnboardingBanner } from "./OnboardingBanner";
import { SessionHistoryCard } from "./SessionHistoryCard";
import styles from "./dashboard.module.css";

/* The dashboard — ports index.html:470-593. Aggregates the four views this
 * step depends on (Tasks, Exams, Timer, Library) into one command-center
 * grid, so it lands last among them (ledger step 12, per the plan's Section
 * 4: "a read-mostly aggregation; building it earlier would mean mocking
 * everything twice"). */
export function DashboardView() {
  return (
    <main className={styles.view}>
      <div className={styles.pageHeader}>
        <h1>Dashboard</h1>
      </div>

      <div className={styles.grid}>
        <NextExamCard />
        <FocusCard />
        <StreakCard />
        <TasksCard />
        <AIActionsCard />
      </div>

      <OnboardingBanner />

      <SessionHistoryCard />
    </main>
  );
}
