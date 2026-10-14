import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { KeyboardEvent } from "react";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useAuth } from "../../context/auth";
import { AccountTab } from "./AccountTab";
import { AppearanceTab } from "./AppearanceTab";
import { SecurityTab } from "./SecurityTab";
import { PreferencesTab } from "./PreferencesTab";
import { NotificationsTab } from "./NotificationsTab";
import { BillingTab } from "./BillingTab";
import { PrivacyTab } from "./PrivacyTab";
import { DangerTab } from "./DangerTab";
import styles from "./settings.module.css";

/* Six sections (2026-10 revamp, design_handoff → Research Report IA): what
 * students actually change, named the way they'd say it. Nothing was
 * removed — Security now sits under "You" and data/account removal under
 * "Privacy and data". The old ids keep working as deep links (TAB_ALIASES). */
export const SETTINGS_TABS = [
  {
    id: "account",
    label: "You",
    description: "Profile, password and sign-in",
    icon: "user",
  },
  {
    id: "appearance",
    label: "Look and reading",
    description: "Theme, text size and reading mode",
    icon: "palette",
  },
  {
    id: "preferences",
    label: "Study",
    description: "Tutor, language and calendar",
    icon: "settings",
  },
  {
    id: "notifications",
    label: "Reminders",
    description: "When and how we nudge you",
    icon: "bell",
  },
  {
    id: "privacy",
    label: "Privacy and data",
    description: "AI consent, exports and your account",
    icon: "shield",
  },
  {
    id: "billing",
    label: "Plan and usage",
    description: "Your plan and today's tutor goes",
    icon: "sparkles",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: IconName;
}>;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

const PANELS: Record<SettingsTabId, () => React.ReactElement> = {
  account: () => (
    <>
      <AccountTab />
      <SecurityTab />
    </>
  ),
  appearance: AppearanceTab,
  preferences: PreferencesTab,
  notifications: NotificationsTab,
  billing: BillingTab,
  privacy: () => (
    <>
      <PrivacyTab />
      <DangerTab />
    </>
  ),
};

/* Deep links from before the six-section Settings, and "subscription",
   which five upgrade prompts link to and which was never a tab id (they all
   landed on Account). */
const TAB_ALIASES: Record<string, SettingsTabId> = {
  security: "account",
  danger: "privacy",
  subscription: "billing",
};

export function SettingsView() {
  /* `?tab=privacy` opens that tab, so messages elsewhere in the app ("turn
     on AI in Settings") can send the student to the right place, not to the
     first tab to hunt from there. */
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState<SettingsTabId>(() => {
    const raw = searchParams.get("tab") ?? "";
    const wanted = TAB_ALIASES[raw] ?? raw;
    return SETTINGS_TABS.some((t) => t.id === wanted)
      ? (wanted as SettingsTabId)
      : "account";
  });
  const { signOut } = useAuth();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = SETTINGS_TABS.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (index + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (index - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    const id = SETTINGS_TABS[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  const Panel = PANELS[active];

  return (
    <div className={styles.view}>
      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Settings tabs">
          <span className={styles.sidebarLabel}>Sections</span>
          <div
            role="tablist"
            aria-orientation="vertical"
            className={styles.tablist}
          >
            {SETTINGS_TABS.map((tab, i) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`settings-tab-${tab.id}`}
                aria-label={tab.label}
                aria-selected={active === tab.id}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={active === tab.id ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                className={styles.tabBtn}
                onClick={() => setActive(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                <span className={styles.tabIcon}>
                  <Icon name={tab.icon} size={18} />
                </span>
                <span className={styles.tabText}>
                  <span className={styles.tabLabel}>{tab.label}</span>
                  <span className={styles.tabDescription} aria-hidden="true">
                    {tab.description}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <hr className={styles.divider} />

          <button
            type="button"
            className={styles.logoutBtn}
            onClick={() => void signOut()}
          >
            <span className={styles.tabIcon}>
              <Icon name="log-out" size={18} />
            </span>
            Log Out
          </button>
        </nav>

        <div className={styles.content}>
          <div
            role="tabpanel"
            id={`settings-panel-${active}`}
            aria-labelledby={`settings-tab-${active}`}
            tabIndex={0}
            className={styles.panel}
            /* Remount the panel to discard unsaved tab-local drafts. */
            key={active}
          >
            <Panel />
          </div>
        </div>
      </div>
    </div>
  );
}
