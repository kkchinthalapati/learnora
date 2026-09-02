import { useRef, useState } from "react";
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
import { DangerTab } from "./DangerTab";
import styles from "./settings.module.css";

export const SETTINGS_TABS = [
  {
    id: "account",
    label: "Account",
    description: "Profile and exports",
    icon: "user",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and display",
    icon: "palette",
  },
  {
    id: "security",
    label: "Security",
    description: "Password and sessions",
    icon: "lock",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "AI, language, and calendar",
    icon: "settings",
  },
  {
    id: "billing",
    label: "Plan",
    description: "Subscription and billing",
    icon: "sparkles",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Reminders and devices",
    icon: "bell",
  },
  {
    id: "danger",
    label: "Danger Zone",
    description: "Data and account removal",
    icon: "alert-triangle",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: IconName;
}>;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

const PANELS: Record<SettingsTabId, () => React.ReactElement> = {
  account: AccountTab,
  appearance: AppearanceTab,
  security: SecurityTab,
  preferences: PreferencesTab,
  notifications: NotificationsTab,
  billing: BillingTab,
  danger: DangerTab,
};

export function SettingsView() {
  const [active, setActive] = useState<SettingsTabId>("account");
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
                className={`${styles.tabBtn}${
                  tab.id === "danger" ? ` ${styles.tabBtnDanger}` : ""
                }`}
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
