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
import { ResumeLearningCard } from "./ResumeLearningCard";
import { SessionHistoryCard } from "./SessionHistoryCard";
import { StreakCard } from "./StreakCard";
import { StudyCircleCard } from "./StudyCircleCard";
import { TasksCard } from "./TasksCard";
import styles from "./dashboard.module.css";

function dashboardDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
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
            Check what is due, then continue your last study block.
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

      <section
        className={`${styles.dashboardRegion} ${styles.priorityRegion}`}
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
        <div className={styles.priorityStrip}>
          <NextExamCard />
          <TasksCard taskInputRef={taskInputRef} />
          <DailyDrillCard />
        </div>
      </section>

      <div className={styles.learningLayout}>
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
          </div>
          <div className={styles.continueStack}>
            <ResumeLearningCard />
            <FocusCard />
          </div>
        </section>

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
          </div>
          <StreakCard />
        </section>
      </div>

      <section
        className={styles.dashboardRegion}
        aria-labelledby="study-support"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>Study support</span>
            <h2 id="study-support" className={styles.regionTitle}>
              Review health and planning
            </h2>
          </div>
        </div>
        <div className={styles.supportGrid}>
          <AdaptiveHealthWidget />
          <AIActionsCard />
        </div>
      </section>

      <section
        className={styles.dashboardRegion}
        aria-labelledby="recent-activity"
      >
        <div className={styles.regionHeader}>
          <div>
            <span className={styles.regionLabel}>Recent</span>
            <h2 id="recent-activity" className={styles.regionTitle}>
              Sessions and community
            </h2>
          </div>
        </div>
        <div className={styles.activityGrid}>
          <SessionHistoryCard />
          <StudyCircleCard />
        </div>
      </section>
    </div>
  );
}
