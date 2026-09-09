import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
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

export type DashboardTab = "focus" | "insights" | "activity" | "all";

export function DashboardView({
  initialTab,
}: {
  initialTab?: DashboardTab;
} = {}) {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as DashboardTab | null;
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    if (initialTab) return initialTab;
    if (urlTab && ["focus", "insights", "activity", "all"].includes(urlTab)) {
      return urlTab;
    }
    if (import.meta.env.MODE === "test") return "all";
    return "focus";
  });

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
          <Link to="/study" className={styles.studyLabLink}>
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

      {/* Progressive Disclosure Tabs */}
      <div
        className={styles.tabNav}
        role="tablist"
        aria-label="Dashboard views"
      >
        <button
          type="button"
          role="tab"
          id="tab-focus"
          aria-selected={activeTab === "focus"}
          aria-controls="panel-focus"
          className={`${styles.tabBtn} ${
            activeTab === "focus" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("focus")}
        >
          <Icon name="clock" size={15} /> Focus &amp; Tasks
        </button>
        <button
          type="button"
          role="tab"
          id="tab-insights"
          aria-selected={activeTab === "insights"}
          aria-controls="panel-insights"
          className={`${styles.tabBtn} ${
            activeTab === "insights" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("insights")}
        >
          <Icon name="activity" size={15} /> Insights &amp; Trajectory
        </button>
        <button
          type="button"
          role="tab"
          id="tab-activity"
          aria-selected={activeTab === "activity"}
          aria-controls="panel-activity"
          className={`${styles.tabBtn} ${
            activeTab === "activity" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("activity")}
        >
          <Icon name="users" size={15} /> Activity &amp; Peers
        </button>
        <button
          type="button"
          role="tab"
          id="tab-all"
          aria-selected={activeTab === "all"}
          aria-controls="panel-all"
          className={`${styles.tabBtn} ${
            activeTab === "all" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("all")}
        >
          <Icon name="layers" size={15} /> All
        </button>
      </div>

      <OnboardingBanner
        onFocusTaskInput={() => taskInputRef.current?.focus()}
      />

      {/* Tab 1: Focus & Tasks (Elevated Focus + Next Exam) */}
      {activeTab === "focus" && (
        <div
          id="panel-focus"
          role="tabpanel"
          aria-labelledby="tab-focus"
          className={styles.tabContent}
        >
          {sections.recentNotebooks && <RecentNotebooksShelf />}
          <section
            className={styles.dashboardRegion}
            aria-labelledby="focus-priorities"
          >
            <div className={styles.regionHeader}>
              <div>
                <span className={styles.regionLabel}>Immediate focus</span>
                <h2 id="focus-priorities" className={styles.regionTitle}>
                  Focus &amp; Next Exam
                </h2>
              </div>
              <p className={styles.regionDescription}>
                Start your 25m Pomodoro or prepare for your upcoming deadline.
              </p>
            </div>
            <div className={styles.heroFocusGrid}>
              {sections.continueStudying && <FocusCard />}
              {sections.priorities && <NextExamCard />}
            </div>
          </section>

          <section
            className={styles.dashboardRegion}
            aria-labelledby="tasks-resume"
          >
            <div className={styles.regionHeader}>
              <div>
                <span className={styles.regionLabel}>Work queue</span>
                <h2 id="tasks-resume" className={styles.regionTitle}>
                  Tasks &amp; Continue
                </h2>
              </div>
              <p className={styles.regionDescription}>
                Pick up where you left off or check off urgent tasks.
              </p>
            </div>
            <div className={styles.focusSecondaryGrid}>
              {sections.priorities && <TasksCard taskInputRef={taskInputRef} />}
              {sections.continueStudying && <ResumeLearningCard />}
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Insights & Trajectory (Forecast, Mistakes, Memory) */}
      {activeTab === "insights" && (
        <div
          id="panel-insights"
          role="tabpanel"
          aria-labelledby="tab-insights"
          className={styles.tabContent}
        >
          {sections.nextHour && <NextHourCard />}
          {sections.todayTimeline && <TodayTimelineCard />}
          <section
            className={styles.dashboardRegion}
            aria-labelledby="insights-overview"
          >
            <div className={styles.regionHeader}>
              <div>
                <span className={styles.regionLabel}>
                  Memory &amp; Momentum
                </span>
                <h2 id="insights-overview" className={styles.regionTitle}>
                  Mistakes &amp; Retention
                </h2>
              </div>
              <p className={styles.regionDescription}>
                Review tricky concepts, track memory decay, and keep your streak
                alive.
              </p>
            </div>
            <div className={styles.progressGrid}>
              {sections.progressStreak && <MisconceptionLedgerCard />}
              {sections.progressStreak && <AdaptiveHealthWidget />}
              {sections.progressStreak && <StreakCard />}
            </div>
          </section>
        </div>
      )}

      {/* Tab 3: Activity & Peers (Rings, Drills, Friends) */}
      {activeTab === "activity" && (
        <div
          id="panel-activity"
          role="tabpanel"
          aria-labelledby="tab-activity"
          className={styles.tabContent}
        >
          <section
            className={styles.dashboardRegion}
            aria-labelledby="activity-overview"
          >
            <div className={styles.regionHeader}>
              <div>
                <span className={styles.regionLabel}>Activity &amp; Peers</span>
                <h2 id="activity-overview" className={styles.regionTitle}>
                  Daily Goals &amp; Study Peers
                </h2>
              </div>
              <p className={styles.regionDescription}>
                Daily drills, study circles with friends, and quick AI tools.
              </p>
            </div>
            <div className={styles.communityGrid}>
              {sections.activityRings && <ActivityRingsCard />}
              {sections.priorities && <DailyDrillCard />}
              {sections.sessionsCommunity && <StudyCircleCard />}
              {sections.sessionsCommunity && <SessionHistoryCard />}
              {sections.sessionsCommunity && <AIActionsCard />}
            </div>
          </section>
        </div>
      )}

      {/* Tab 4: All (Full dashboard view with elevated hero) */}
      {activeTab === "all" && (
        <div
          id="panel-all"
          role="tabpanel"
          aria-labelledby="tab-all"
          className={styles.tabContent}
        >
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
                  Choose one useful action, then start. Everything else can
                  wait.
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
                  Track focus goals, streak momentum, and memory retention
                  health.
                </p>
              </div>
              <div className={styles.progressGrid}>
                <StreakCard />
                <AdaptiveHealthWidget />
                <MisconceptionLedgerCard />
              </div>
            </section>
          )}

          {sections.sessionsCommunity && (
            <section
              className={styles.dashboardRegion}
              aria-labelledby="recent-activity"
            >
              <div className={styles.regionHeader}>
                <div>
                  <span className={styles.regionLabel}>
                    Activity &amp; Support
                  </span>
                  <h2 id="recent-activity" className={styles.regionTitle}>
                    Sessions and community
                  </h2>
                </div>
                <p className={styles.regionDescription}>
                  Ask Learnora AI, see live study peers, and review recent
                  sessions.
                </p>
              </div>
              <div className={styles.communityGrid}>
                <AIActionsCard />
                <StudyCircleCard />
                <SessionHistoryCard />
              </div>
            </section>
          )}
        </div>
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
