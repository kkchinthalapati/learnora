import { useLocation } from "react-router";
import { Icon } from "./Icon";
import { useAuth } from "../context/auth";
import { useLiveClock } from "../hooks/useLiveClock";
import { getGreeting } from "../lib/greeting";
import { sectionLabel } from "../lib/sectionLabel";
import styles from "./Header.module.css";

/* Ports index.html:413-445 (`header`, `#page-title`, `#user-greeting`,
 * `#live-clock`, `#header-logout-btn`, `#menu-toggle`).
 *
 * `#page-title` is deliberately not reproduced as a heading here. The
 * vanilla needed it because one static document swapped which section was
 * visible; every view in this app already renders its own real `<h1>` (the
 * exact same text this header would show for Dashboard/Tasks/Exams/Timer/
 * Plan/Settings, or "Library" while a view under it — a subject, a note, a
 * quiz, a flashcard review — titles itself with the specific thing inside).
 * A second element with the same text and heading semantics would be a
 * duplicate `<h1>` per page, not a port. The label still renders, styled the
 * same way, just without competing for the page's one main heading. */

export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const time = useLiveClock();

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    "Student";

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.menuToggle}
          aria-label="Toggle Sidebar Menu"
          title="Toggle Sidebar Menu"
          onClick={onToggleMenu}
        >
          ☰
        </button>
        <div>
          <p className={styles.title}>{sectionLabel(pathname)}</p>
          <p className={styles.subtitle}>{getGreeting(firstName)}</p>
        </div>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.clock}>{time}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Log Out"
          title="Log Out"
          onClick={() => void signOut()}
        >
          <Icon name="log-out" size={20} />
        </button>
      </div>
    </header>
  );
}
