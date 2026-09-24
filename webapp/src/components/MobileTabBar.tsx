import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import {
  primaryDestinationForPath,
  type PrimaryDestination,
} from "../lib/sectionLabel";
import styles from "./MobileTabBar.module.css";

/* Bottom tab bar for phones (≤768px; hidden above that by CSS).
 *
 * Before this, every destination on a phone sat behind one hamburger in the
 * top-left corner — the hardest spot to reach one-handed, and invisible as
 * navigation to a student who doesn't know that icon. The five places a
 * student goes most are one thumb-tap away; everything else (Progress,
 * community, account) is under More, which opens the existing drawer. */

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
  { to: "/timer", label: "Timer", icon: "clock", destination: "focus" },
];

export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const current = primaryDestinationForPath(pathname);
  const inTabs = TABS.some((t) => t.destination === current);

  return (
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
      <button
        type="button"
        className={`${styles.tab} ${!inTabs && current ? styles.active : ""}`}
        onClick={onMore}
        aria-label="More: Progress, community and account"
      >
        <Icon name="menu" size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}
