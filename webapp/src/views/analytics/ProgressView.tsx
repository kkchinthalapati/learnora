import { useSearchParams } from "react-router";
import { ButtonLink } from "../../components/ButtonLink";
import { PageHeader } from "../../components/PageHeader";
import { isFlagOn } from "../../lib/flags";
import { ProGate } from "../../components/ProGate";
import { Tabs, TabPanel, useTabIds, type TabItem } from "../../components/Tabs";
import { MisconceptionLedgerCard } from "../dashboard/MisconceptionLedgerCard";
import { TrajectoryBody } from "../trajectory/TrajectoryView";
import { FadingTopicsCard } from "./FadingTopicsCard";
import { StudyAnalyticsView } from "./StudyAnalyticsView";
import { UnderstandingPanel } from "./UnderstandingPanel";
import styles from "./progress.module.css";

/* Progress (webapp/DESIGN.md 0.1): one page for what you've done, what you
 * keep getting wrong, and where you're heading. History and the exam
 * forecast used to be two pages joined by a second row of links; the mistake
 * ledger sat on top of History. They're three tabs of one page now, and the
 * tab lives in the URL (/trajectory redirects to ?tab=forecast).
 *
 * History opens first: the forecast is a Pro feature, and a free account
 * shouldn't land on a paywall when it asks how it's doing. */

/* 2026-11: "What you know" opens first. Progress used to open on History,
   which is time spent; the question a student brings here is what they have
   actually learned. History's charts are one tab along, unchanged, for
   anyone who wants them. */
type ProgressTab = "know" | "mistakes" | "history" | "forecast";
const TABS: ReadonlyArray<TabItem<ProgressTab>> = [
  { value: "know", label: "What you know" },
  { value: "mistakes", label: "Mistakes" },
  { value: "history", label: "History" },
  { value: "forecast", label: "Exam forecast" },
];

export function ProgressView() {
  const [params, setParams] = useSearchParams();
  const wanted = params.get("tab");
  const tab: ProgressTab = TABS.some((t) => t.value === wanted) ? (wanted as ProgressTab) : "know";
  const idBase = useTabIds();

  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title="Progress"
        sub="What you know, what to revisit, and what you've done."
        actions={
          isFlagOn("classMap") ? (
            <ButtonLink variant="ghost" to="/classes">
              Classes
            </ButtonLink>
          ) : undefined
        }
      />
      <Tabs
        items={TABS}
        value={tab}
        onChange={(next) => setParams(next === "know" ? {} : { tab: next }, { replace: true })}
        label="Parts of Progress"
        idBase={idBase}
      />
      <TabPanel idBase={idBase} value={tab}>
        {tab === "know" ? (
          <UnderstandingPanel />
        ) : tab === "history" ? (
          <StudyAnalyticsView />
        ) : tab === "mistakes" ? (
          <div className={styles.stack}>
            <MisconceptionLedgerCard />
            <FadingTopicsCard />
          </div>
        ) : (
          <ProGate feature="trajectory" loadingHeight={220}>
            <TrajectoryBody />
          </ProGate>
        )}
      </TabPanel>
    </div>
  );
}
