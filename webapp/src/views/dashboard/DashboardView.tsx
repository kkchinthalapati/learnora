import { useRef } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AdaptiveHealthWidget } from "./AdaptiveHealthWidget";
import { AIActionsCard } from "./AIActionsCard";
import { DailyDrillCard } from "./DailyDrillCard";
import { FocusCard } from "./FocusCard";
import { NextExamCard } from "./NextExamCard";
import { OnboardingBanner } from "./OnboardingBanner";
import { RecentNotebooksShelf } from "./RecentNotebooksShelf";
import { ResumeLearningCard } from "./ResumeLearningCard";
import { SessionHistoryCard } from "./SessionHistoryCard";
import { StreakCard } from "./StreakCard";
import { StudyCircleCard } from "./StudyCircleCard";
import { TasksCard } from "./TasksCard";
import styles from "./dashboard.module.css";

function dashboardDate() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function DashboardView() {
  const taskInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  return (
    <div className={styles.view}>
      <header className={styles.dashboardLead}>
        <div>
          <span className={styles.dashboardDate}>{dashboardDate()}</span>
          <p className={styles.dashboardPrompt}>
            Check what is due, open your notebooks, or continue your last study block.
          </p>
        </div>
        <Button
          variant="primary"
          className={styles.startFocusButton}
          onClick={() => void navigate("/timer")}
        >
          <Icon name="clock" size={17} />
          Start focus session
        </Button>
      </header>

      <OnboardingBanner
        onFocusTaskInput={() => taskInputRef.current?.focus()}
      />

      <RecentNotebooksShelf />

      {/* Section 1: Priorities (3 distinct spacious cards) */}
      <section
        className={styles.dashboardRegion}
        aria-labelledby="dashboard-priorities"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>Today</span>
            <h2 id="dashboard-priorities" className={styles.regionTitle}>
              Priorities
            </h2>
          </div>
          <p className={styles.regionDescription}>
            Upcoming exam, open tasks, and cards ready for review.
          </p>
        </div>
        <div className={styles.priorityGrid}>
          <NextExamCard />
          <TasksCard taskInputRef={taskInputRef} />
          <DailyDrillCard />
        </div>
      </section>

      {/* Section 2: Active Study & Focus (Balanced 2-column) */}
      <section
        className={styles.dashboardRegion}
        aria-labelledby="continue-studying"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>Current work</span>
            <h2 id="continue-studying" className={styles.regionTitle}>
              Continue studying
            </h2>
          </div>
          <p className={styles.regionDescription}>
            Pick up your latest materials or start a quick timer session.
          </p>
        </div>
        <div className={styles.studyLayout}>
          <ResumeLearningCard />
          <FocusCard />
        </div>
      </section>

      {/* Section 3: Progress, Streak & Memory Decay */}
      <section
        className={styles.dashboardRegion}
        aria-labelledby="weekly-progress"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>This week</span>
            <h2 id="weekly-progress" className={styles.regionTitle}>
              Progress and streak
            </h2>
          </div>
          <p className={styles.regionDescription}>
            Track focus goals, streak momentum, and memory retention health.
          </p>
        </div>
        <div className={styles.progressGrid}>
          <StreakCard />
          <AdaptiveHealthWidget />
        </div>
      </section>

      {/* Section 4: Sessions, Community & AI Support */}
      <section
        className={styles.dashboardRegion}
        aria-labelledby="recent-activity"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>Activity & Support</span>
            <h2 id="recent-activity" className={styles.regionTitle}>
              Sessions and community
            </h2>
          </div>
          <p className={styles.regionDescription}>
            Ask Learnora AI, see live study peers, and review recent sessions.
          </p>
        </div>
        <div className={styles.communityGrid}>
          <AIActionsCard />
          <StudyCircleCard />
          <SessionHistoryCard />
        </div>
      </section>
    </div>
  );
}
