import { useSearchParams } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { Tabs, TabPanel, useTabIds } from "../../components/Tabs";
import { AccountTab } from "./AccountTab";
import { AppearanceTab } from "./AppearanceTab";
import { SecurityTab } from "./SecurityTab";
import { PreferencesTab } from "./PreferencesTab";
import { NotificationsTab } from "./NotificationsTab";
import { BillingTab } from "./BillingTab";
import { PrivacyTab } from "./PrivacyTab";
import { DangerTab } from "./DangerTab";
import styles from "./settings.module.css";

/* Settings (webapp/DESIGN.md 0.3-0.4): the same page header and tab strip as
 * every other page with parts, and five sections where there were eight in a
 * vertical rail. Security and deleting your data are part of your account;
 * study preferences and reminders are how you study. Sign out lives in the
 * profile menu, once. */

export const SETTINGS_TABS = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "study", label: "Study" },
  { id: "privacy", label: "Privacy and AI" },
  { id: "billing", label: "Plan and billing" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/* Section names from before the 2026-10 overhaul, still in old links and
   bookmarks, open the section that now holds them. */
const FORMER_TABS: Record<string, SettingsTabId> = {
  security: "account",
  danger: "account",
  preferences: "study",
  notifications: "study",
  subscription: "billing",
};

const PANELS: Record<SettingsTabId, () => React.ReactElement> = {
  account: () => (
    <>
      <AccountTab />
      <SecurityTab />
      <DangerTab />
    </>
  ),
  appearance: AppearanceTab,
  study: () => (
    <>
      <PreferencesTab />
      <NotificationsTab />
    </>
  ),
  privacy: PrivacyTab,
  billing: BillingTab,
};

export function resolveSettingsTab(wanted: string | null): SettingsTabId {
  if (wanted && SETTINGS_TABS.some((t) => t.id === wanted)) return wanted as SettingsTabId;
  return (wanted && FORMER_TABS[wanted]) || "account";
}

export function SettingsView() {
  /* `?tab=privacy` opens that section, so messages elsewhere ("turn on AI in
     Settings") send the student to the right place. */
  const [searchParams, setSearchParams] = useSearchParams();
  const active = resolveSettingsTab(searchParams.get("tab"));
  const idBase = useTabIds();
  const Panel = PANELS[active];

  return (
    <div className={styles.view}>
      <PageHeader as="h1" title="Settings" />
      <Tabs
        items={SETTINGS_TABS.map((t) => ({ value: t.id, label: t.label }))}
        value={active}
        onChange={(next) => setSearchParams(next === "account" ? {} : { tab: next }, { replace: true })}
        label="Settings sections"
        idBase={idBase}
      />
      <TabPanel idBase={idBase} value={active}>
        {/* Remount on switch to discard a section's unsaved drafts. */}
        <div className={styles.panel} key={active}>
          <Panel />
        </div>
      </TabPanel>
    </div>
  );
}
