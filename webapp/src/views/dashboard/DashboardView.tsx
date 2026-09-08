import { useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AdaptiveHealthWidget } from "./AdaptiveHealthWidget";
import { MisconceptionLedgerCard } from "./MisconceptionLedgerCard";
import { AIActionsCard } from "./AIActionsCard";
import { ActivityRingsCard } from "./ActivityRingsCard";
import { DailyDrillCard } from "./DailyDrillCard";
import {
  DashboardCustomizeModal,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardLayoutPreferences,
} from "./DashboardCustomizeModal";
import { FocusCard } from "./FocusCard";
import { NextExamCard } from "./NextExamCard";
import { NextHourCard } from "./NextHourCard";
import { OnboardingBanner } from "./OnboardingBanner";
import { RecentNotebooksShelf } from "./RecentNotebooksShelf";
import { ResumeLearningCard } from "./ResumeLearningCard";
import { SessionHistoryCard } from "./SessionHistoryCard";
import { StreakCard } from "./StreakCard";
import { TodayTimelineCard } from "./TodayTimelineCard";
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
  const [layout, setLayout] =
    useState<DashboardLayoutPreferences>(loadDashboardLayout);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const sections = layout.visibleSections;

  const handleSaveLayout = (next: DashboardLayoutPreferences) => {
    setLayout(next);
    saveDashboardLayout(next);
  };

  return (
    <div className={styles.view}>
      <header className={styles.dashboardLead}>
        <div>
          <span className={styles.dashboardDate}>{dashboardDate()}</span>
          <p className={styles.dashboardPrompt}>
            Check what is due, open your notebooks, or continue your last study
            block.
          </p>
        </div>
        <div className={styles.leadActions}>
          <Link to="/study-lab" className={styles.studyLabLink}>
            <Icon name="target" size={15} /> Choose a study exercise
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCustomizeOpen(true)}
            aria-label="Customize dashboard layout"
          >
            <Icon name="settings" size={14} /> Customize
          </Button>
        </div>
      </header>

      <OnboardingBanner
        onFocusTaskInput={() => taskInputRef.current?.focus()}
      />

      {/* Above "Study next" on purpose. That section offers a student three
          reasonable things to do and leaves them to choose; this one has an
          arithmetic answer to the same question, so it goes first or it is
          decoration. It renders nothing when it has no forecast to stand on,
          in which case the cards below simply move up. */}
      {sections.nextHour && <NextHourCard />}

      {sections.priorities && (
        <section
          className={styles.dashboardRegion}
          aria-labelledby="dashboard-priorities"
        >
          <div className={styles.regionHeader}>
            <div>
              <span className={styles.regionLabel}>Do this next</span>
              <h2 id="dashboard-priorities" className={styles.regionTitle}>
                Study next
              </h2>
            </div>
            <p className={styles.regionDescription}>
              Choose one useful action, then start. Everything else can wait.
            </p>
          </div>
          <div className={styles.priorityGrid}>
            <NextExamCard />
            <TasksCard taskInputRef={taskInputRef} />
            <DailyDrillCard />
          </div>
        </section>
      )}

      {sections.todayTimeline && <TodayTimelineCard />}

      {sections.recentNotebooks && <RecentNotebooksShelf />}

      {/* Section 2: Active Study & Focus (Balanced 2-column) */}
      {sections.continueStudying && (
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
      )}

      {sections.activityRings && <ActivityRingsCard />}

      {/* Section 3: Progress, Streak & Memory Refresher */}
      {sections.progressStreak && (
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
            <MisconceptionLedgerCard />
          </div>
        </section>
      )}

      {/* Section 4: Sessions, Community & AI Support */}
      {sections.sessionsCommunity && (
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
      )}

      {customizeOpen && (
        <DashboardCustomizeModal
          isOpen={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          layout={layout}
          onSave={handleSaveLayout}
        />
      )}
    </div>
  );
}
