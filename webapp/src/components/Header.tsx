import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { useAuth } from "../context/auth";
import { useOptionalCommandPalette } from "../context/commandPalette";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { sectionLabel, viewOwnsPageTitle } from "../lib/sectionLabel";
import styles from "./Header.module.css";
import { HelpCenter } from "./HelpCenter";

/* The shortcut hint in the platform's own terms: "⌘K" means nothing on the
   Windows and Chromebook laptops most students use. */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const SEARCH_SHORTCUT = IS_MAC ? "⌘K" : "Ctrl K";

export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const commandPalette = useOptionalCommandPalette();
  const time = useLiveClock();
  const t = useTranslation();

  /* Views listed in viewOwnsPageTitle() render their own hero <h1>; the shell
     yields the title to them so the page does not name itself twice. */
  const ownsTitle = !viewOwnsPageTitle(pathname);
  /* Today's own headline greets the student and its meta line carries the
     date, so the shell adds neither there (2026-09 redesign). */
  const showClock = pathname.startsWith("/timer");

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <IconButton
          className={styles.menuToggle}
          aria-label="Toggle Sidebar Menu"
          title="Toggle Sidebar Menu"
          onClick={onToggleMenu}
        >
          <Icon name="menu" size={20} />
        </IconButton>
        <div className={styles.pageIdentity}>
          {ownsTitle ? (
            <h1 className={styles.title}>{sectionLabel(pathname, t)}</h1>
          ) : null}
        </div>
      </div>

      <div className={styles.headerRight}>
        <HelpCenter />
        {/* Ask the tutor and search live in the sidebar (⌘J / ⌘K) since the
            2026-09 redesign; theme lives in Settings → Appearance. Search
            stays here only on phones, where the sidebar is a drawer. */}
        <button
          type="button"
          className={styles.searchTrigger}
          onClick={() => commandPalette?.open()}
          aria-label="Search and command palette"
          title={`Search or run commands (${SEARCH_SHORTCUT})`}
        >
          <Icon name="search" size={16} />
          <span className={styles.searchTriggerLabel}>Search</span>
          <kbd className={styles.searchKbd}>{SEARCH_SHORTCUT}</kbd>
        </button>
        {showClock ? <span className={styles.clock}>{time}</span> : null}
        {/* Log out moved to the sidebar's Account group and Settings; an
            icon here was one mis-tap from ending the session. */}
        {user ? null : (
          <div className={styles.guestAuthGroup}>
            <span className={styles.guestBadge}>Guest Mode</span>
            <Link to="/login" className={styles.signInLink}>
              Sign In
            </Link>
            <Link to="/signup" className={styles.signUpBtn}>
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
