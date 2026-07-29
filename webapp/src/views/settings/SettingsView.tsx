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
import { DangerTab } from "./DangerTab";
import styles from "./settings.module.css";

/* Ports the vanilla Settings view (index.html:956-1740 + js/main.js:761-1170).
 *
 * The tab strip is a real ARIA tablist here. The vanilla shipped plain
 * <button>s that toggled a `.active` class (js/main.js:761-773): visually
 * a tab strip, but nothing told a screen reader these were tabs, which was
 * selected, or which panel each controlled — and arrow keys did nothing.
 * Same visual, same six tabs, same order.
 *
 * Only the selected panel is rendered rather than all six behind
 * `display:none`, so a control in a hidden tab can't be reached by Tab or
 * be read out by a screen reader — the vanilla's six always-present panels
 * left every field in the tab order at all times. */

export const SETTINGS_TABS = [
  { id: "account", label: "Account", icon: "user" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "security", label: "Security", icon: "lock" },
  { id: "preferences", label: "Preferences", icon: "settings" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "danger", label: "Danger Zone", icon: "alert-triangle" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: IconName;
}>;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

const PANELS: Record<SettingsTabId, () => React.ReactElement> = {
  account: AccountTab,
  appearance: AppearanceTab,
  security: SecurityTab,
  preferences: PreferencesTab,
  notifications: NotificationsTab,
  danger: DangerTab,
};

export function SettingsView() {
  const [active, setActive] = useState<SettingsTabId>("account");
  const { signOut } = useAuth();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /* Roving arrow-key navigation, per the WAI-ARIA tabs pattern. Home/End
     jump to the ends; Left/Right wrap. */
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
    <main className={styles.view}>
      <div className={styles.pageHeader}>
        <h1>Settings</h1>
      </div>

      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label="Settings tabs">
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
                {tab.label}
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
            /* Keyed so switching tabs remounts the panel: each tab owns local
               draft state (a half-typed email, an unsent password) that should
               not survive a trip to another tab and back. */
            key={active}
          >
            <Panel />
          </div>
        </div>
      </div>
    </main>
  );
}
