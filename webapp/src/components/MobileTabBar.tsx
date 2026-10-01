import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { useOptionalChat } from "../context/chat";
import {
  primaryDestinationForPath,
  type PrimaryDestination,
} from "../lib/sectionLabel";
import styles from "./MobileTabBar.module.css";

/* Bottom tab bar for phones (≤768px; hidden above that by CSS).
 *
 * The same five destinations as the sidebar, one thumb-tap away. The tutor
 * is a floating button above the bar rather than a sixth tab: it is an
 * overlay you summon over wherever you are, not a place you go. Community
 * and account stay in the drawer behind the header's menu button. */

const TABS: ReadonlyArray<{
  to: string;
  label: string;
  icon: IconName;
  destination: PrimaryDestination;
}> = [
  { to: "/", label: "Today", icon: "dashboard", destination: "dashboard" },
  { to: "/library", label: "Library", icon: "layers", destination: "library" },
  { to: "/study", label: "Study", icon: "target", destination: "study_lab" },
  { to: "/plan", label: "Plan", icon: "calendar", destination: "plan" },
  {
    to: "/analytics",
    label: "Progress",
    icon: "activity",
    destination: "progress",
  },
];

export function MobileTabBar() {
  const { pathname } = useLocation();
  const current = primaryDestinationForPath(pathname);
  const chat = useOptionalChat();

  return (
    <>
      <nav className={styles.bar} aria-label="Quick navigation">
        {TABS.map((tab) => {
          const active = tab.destination === current;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`${styles.tab} ${active ? styles.active : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={tab.icon} size={20} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      {chat && !chat.isOpen ? (
        <button
          type="button"
          className={styles.ask}
          onClick={() => chat.open()}
          aria-label="Ask the tutor"
        >
          <Icon name="sparkles" size={22} />
        </button>
      ) : null}
    </>
  );
}
