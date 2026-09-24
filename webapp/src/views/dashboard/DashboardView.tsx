import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
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
  hiddenSectionCount,
} from "./DashboardCustomizeModal";
import { FocusCard } from "./FocusCard";
import { OnboardingBanner } from "./OnboardingBanner";
import { SessionHistoryCard } from "./SessionHistoryCard";
import { StreakCard } from "./StreakCard";
import { StudyThisNowCard } from "./StudyThisNowCard";
import { TodayTimelineCard } from "./TodayTimelineCard";
import { StudyCircleCard } from "./StudyCircleCard";
import styles from "./dashboard.module.css";

function dashboardDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

/* The dashboard is everything that is not on Today.
 *
 * It used to open on a "Focus & Tasks" tab that was Today again, card for
 * card — next exam, tasks, notebooks, "pick up where you left off" — plus a
 * second "study this next" card from the forecast engine. A student could not
 * tell which page held what, and the recommendations did not always agree.
 * Today answers "what now?"; this page answers "how am I doing?": the
 * mistakes on record, memory and streaks, activity and peers. Old links that
 * ask for `?tab=focus` land on Insights. */
export type DashboardTab = "insights" | "activity" | "all";

const TABS: ReadonlyArray<{ id: DashboardTab; label: string; icon: IconName }> = [
  { id: "insights", label: "Insights & mistakes", icon: "activity" },
  { id: "activity", label: "Activity & Peers", icon: "users" },
  { id: "all", label: "All", icon: "layers" },
];

export function DashboardView({
  initialTab,
}: {
  initialTab?: DashboardTab;
} = {}) {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    if (initialTab) return initialTab;
    if (urlTab && TABS.some((t) => t.id === urlTab)) {
      return urlTab as DashboardTab;
    }
    return "insights";
  });

  const [layout, setLayout] =
    useState<DashboardLayoutPreferences>(loadDashboardLayout);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const sections = layout.visibleSections;

  const handleSaveLayout = (next: DashboardLayoutPreferences) => {
    setLayout(next);
    saveDashboardLayout(next);
  };

  const memory = sections.progressStreak ? (
    <section
      className={styles.dashboardRegion}
      aria-labelledby="insights-overview"
    >
      <div className={styles.regionHeader}>
        <div>
          <span className={styles.regionLabel}>Memory &amp; mistakes</span>
          <h2 id="insights-overview" className={styles.regionTitle}>
            What you&apos;re getting wrong, and what&apos;s fading
          </h2>
        </div>
        <p className={styles.regionDescription}>
          The misconceptions on record, how well things are sticking, and your
          streak.
        </p>
      </div>
      <div className={styles.progressGrid}>
        <MisconceptionLedgerCard />
        <AdaptiveHealthWidget />
        <StreakCard />
      </div>
    </section>
  ) : null;

  const activity = (
    <section
      className={styles.dashboardRegion}
      aria-labelledby="activity-overview"
    >
      <div className={styles.regionHeader}>
        <div>
          <span className={styles.regionLabel}>Activity &amp; Peers</span>
          <h2 id="activity-overview" className={styles.regionTitle}>
            Daily goals &amp; study peers
          </h2>
        </div>
        <p className={styles.regionDescription}>
          Your focus time and quick timers, today&apos;s drill, and friends.
        </p>
      </div>
      <div className={styles.communityGrid}>
        {sections.continueStudying && <FocusCard />}
        {sections.activityRings && <ActivityRingsCard />}
        {sections.priorities && <DailyDrillCard />}
        {sections.sessionsCommunity && <StudyCircleCard />}
        {sections.sessionsCommunity && <SessionHistoryCard />}
        {/* Not behind `sessionsCommunity`, unlike its neighbours: the AI
            actions are a way into the tutor, not a community widget. */}
        <AIActionsCard />
      </div>
    </section>
  );

  return (
    <div className={styles.view}>
      <header className={styles.dashboardLead}>
        <div>
          <span className={styles.dashboardDate}>{dashboardDate()}</span>
          <p className={styles.dashboardPrompt}>
            How you&apos;re doing: mistakes, memory, streaks and study history.
            What to do next is on{" "}
            <Link to="/" className={styles.leadLink}>Today</Link>.
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

      <div
        className={styles.tabNav}
        role="tablist"
        aria-label="Dashboard views"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`${styles.tabBtn} ${
              activeTab === tab.id ? styles.tabBtnActive : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={15} /> {tab.label}
          </button>
        ))}
      </div>

      <OnboardingBanner />

      {activeTab === "insights" && (
        <div
          id="panel-insights"
          role="tabpanel"
          aria-labelledby="tab-insights"
          className={styles.tabContent}
        >
          {/* Built on the misconception ledger, so it names one specific
              misunderstanding to fix — a different question from Today's
              "which topic is worth the hour", and labelled as such. */}
          <StudyThisNowCard />
          {memory}
          {sections.todayTimeline && <TodayTimelineCard />}
        </div>
      )}

      {activeTab === "activity" && (
        <div
          id="panel-activity"
          role="tabpanel"
          aria-labelledby="tab-activity"
          className={styles.tabContent}
        >
          {activity}
        </div>
      )}

      {activeTab === "all" && (
        <div
          id="panel-all"
          role="tabpanel"
          aria-labelledby="tab-all"
          className={styles.tabContent}
        >
          <StudyThisNowCard />
          {memory}
          {sections.todayTimeline && <TodayTimelineCard />}
          {activity}
          {hiddenSectionCount(layout) > 0 && (
            <button
              type="button"
              className={styles.moreBtn}
              onClick={() => setCustomizeOpen(true)}
            >
              More ({hiddenSectionCount(layout)} hidden)
            </button>
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
