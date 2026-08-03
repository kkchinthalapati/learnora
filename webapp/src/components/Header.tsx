import { useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { useAuth } from "../context/auth";
import { useAppearance } from "../context/appearance";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { getGreeting } from "../lib/greeting";
import { sectionLabel } from "../lib/sectionLabel";
import { resolveDark, THEME_KEY } from "../lib/appearance";
import { Storage } from "../lib/storage";
import styles from "./Header.module.css";

/* Ports index.html:413-445 (`header`, `#page-title`, `#user-greeting`,
 * `#live-clock`, `#header-logout-btn`, `#theme-toggle`, `#menu-toggle`).
 *
 * `#page-title` renders as this page's real `<h1>` — the redesign audit
 * (2026-08) found five views duplicating this exact label as their own
 * `<h1>` directly below it (same text, ~20px apart, in every locale), so
 * the duplicates are being dropped in favor of this one. Views that show
 * something the section label can't (Library's subtitle+actions, Review's
 * deck title, Notes' document title in its own toolbar) keep their own
 * heading; a plain Dashboard/Tasks/Exams/Timer/Settings does not. */

export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { appearance, setAppearance } = useAppearance();
  const time = useLiveClock();
  const t = useTranslation();

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    "Student";

  const isDark = resolveDark(appearance.mode);

  /* Ports `UI.toggleTheme` (js/ui.js:698-704) — a one-click light/dark flip,
   * distinct from the Settings→Appearance studio a few clicks away. The
   * vanilla persisted just the two theme keys directly rather than going
   * through its full "Save Appearance" write, so a student auditioning an
   * accent colour in Settings and then flipping this switch doesn't also
   * commit that unrelated, still-unsaved change — the two-tier appearance
   * contract (Step 7) stays intact for everything but the mode itself. */
  const toggleTheme = () => {
    const nextMode = isDark ? "light" : "dark";
    setAppearance({ mode: nextMode });
    Storage.set("learnora_mode", nextMode);
    Storage.set(THEME_KEY, nextMode);
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <IconButton
          className={styles.menuToggle}
          aria-label="Toggle Sidebar Menu"
          title="Toggle Sidebar Menu"
          onClick={onToggleMenu}
        >
          ☰
        </IconButton>
        <div>
          <h1 className={styles.title}>{sectionLabel(pathname, t)}</h1>
          <p className={styles.subtitle}>{getGreeting(firstName)}</p>
        </div>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.clock}>{time}</span>
        <IconButton
          aria-label="Log Out"
          title="Log Out"
          onClick={() => void signOut()}
        >
          <Icon name="log-out" size={20} />
        </IconButton>
        <IconButton
          aria-label="Toggle Theme"
          title="Toggle Theme"
          onClick={toggleTheme}
        >
          <Icon name={isDark ? "sun" : "moon"} size={24} />
        </IconButton>
      </div>
    </header>
  );
}
