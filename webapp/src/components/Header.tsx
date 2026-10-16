import { Link, useLocation } from "react-router";
import { useAuth } from "../context/auth";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { sectionLabel, viewOwnsPageTitle } from "../lib/sectionLabel";
import styles from "./Header.module.css";

/* The page's title row (DESIGN.md rule 0.3). Navigation, search, Ask and the
 * account live in the TopBar now; this only names the page, for every view
 * that doesn't render its own PageHeader as="h1" (viewOwnsPageTitle). */
export function Header() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const time = useLiveClock();
  const t = useTranslation();

  const ownsTitle = !viewOwnsPageTitle(pathname);
  const showClock = pathname.startsWith("/timer");
  if (!ownsTitle && !showClock && user) return null;

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.pageIdentity}>
          {ownsTitle ? (
            <h1 className={styles.title}>{sectionLabel(pathname, t)}</h1>
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
