import { useRef } from "react";
import { NextExamCard } from "./NextExamCard";
import { FocusCard } from "./FocusCard";
import { StreakCard } from "./StreakCard";
import { TasksCard } from "./TasksCard";
import { AIActionsCard } from "./AIActionsCard";
import { DailyDrillCard } from "./DailyDrillCard";
import { StudyCircleCard } from "./StudyCircleCard";
import { AdaptiveHealthWidget } from "./AdaptiveHealthWidget";
import { ResumeLearningCard } from "./ResumeLearningCard";
import { OnboardingBanner } from "./OnboardingBanner";
import { SessionHistoryCard } from "./SessionHistoryCard";
import styles from "./dashboard.module.css";

/* The dashboard — ports index.html:470-593. Aggregates the four views this
 * step depends on (Tasks, Exams, Timer, Library) into one command-center
 * grid, so it lands last among them (ledger step 12, per the plan's Section
 * 4: "a read-mostly aggregation; building it earlier would mean mocking
 * everything twice").
 *
 * No page-level heading here — the app shell's Header renders the section
 * label as the page's real <h1> (see Header.tsx). This view used to
 * duplicate that exact text as its own <h1> right below it; the redesign
 * audit (2026-08) found that duplication on five views and dropped it. */
export function DashboardView() {
  const taskInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.view}>
      {/* Above the grid, not below it: a brand-new account's first paint is
          six empty-looking cards ("no exams", "no focus time", "no tasks"…),
          and the one thing telling that student what to do about it used to
          be the last thing on the page — scrolled past a wall of emptiness
          rather than leading with the fix for it. */}
      <OnboardingBanner
        onFocusTaskInput={() => taskInputRef.current?.focus()}
      />

      <div className={styles.grid}>
        <ResumeLearningCard />
        <NextExamCard />
        <FocusCard />
        <StreakCard />
        <TasksCard taskInputRef={taskInputRef} />
        <AdaptiveHealthWidget />
        <AIActionsCard />
        <DailyDrillCard />
        <StudyCircleCard />
      </div>

      <SessionHistoryCard />
    </div>
  );
}
