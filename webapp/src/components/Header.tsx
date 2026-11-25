import { Link, useLocation } from "react-router";
import { useAuth } from "../context/auth";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { FALLBACK_SECTION_LABEL, sectionLabel, viewOwnsPageTitle } from "../lib/sectionLabel";
import styles from "./Header.module.css";

/* The page's title row (DESIGN.md rule 0.3). Navigation, search, Ask and the
 * account live in the TopBar now; this only names the page, for every view
 * that doesn't render its own PageHeader as="h1" (viewOwnsPageTitle). */
export function Header() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const time = useLiveClock();
  const t = useTranslation();

  /* A path in no section has nothing to be titled with but the app's name,
     and the pages that land there title themselves: the 404 read "Learnora"
     in large type above "Page not found", and /welcome-pro had two h1s. */
  const label = sectionLabel(pathname, t);
  const ownsTitle = !viewOwnsPageTitle(pathname) && label !== FALLBACK_SECTION_LABEL;
  const showClock = pathname.startsWith("/timer");
  if (!ownsTitle && !showClock && user) return null;

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.pageIdentity}>
          {ownsTitle ? (
            <h1 className={styles.title}>{label}</h1>
          ) : null}
        </div>
      </div>

      <div className={styles.headerRight}>
        {showClock ? <span className={styles.clock}>{time}</span> : null}
        {user ? null : (
          <div className={styles.guestAuthGroup}>
            <span className={styles.guestBadge}>Guest mode</span>
            <Link to="/login" className={styles.signInLink}>
              Sign in
            </Link>
            <Link to="/signup" className={styles.signUpBtn}>
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
