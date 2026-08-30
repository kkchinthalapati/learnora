import { useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { useAuth } from "../context/auth";
import { useAppearance } from "../context/appearance";
import { useOptionalCommandPalette } from "../context/commandPalette";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { getGreeting } from "../lib/greeting";
import { sectionLabel, viewOwnsPageTitle } from "../lib/sectionLabel";
import { resolveDark, THEME_KEY } from "../lib/appearance";
import { Storage } from "../lib/storage";
import styles from "./Header.module.css";

export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { appearance, setAppearance } = useAppearance();
  const commandPalette = useOptionalCommandPalette();
  const time = useLiveClock();
  const t = useTranslation();

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    "Student";
  const isDark = resolveDark(appearance.mode);
  const showDashboardGreeting = pathname === "/";
  /* Views listed in viewOwnsPageTitle() render their own hero <h1>; the shell
     yields the title to them so the page does not name itself twice. */
  const ownsTitle = !viewOwnsPageTitle(pathname);
  const showClock = showDashboardGreeting || pathname.startsWith("/timer");

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
          <Icon name="menu" size={20} />
        </IconButton>
        <div className={styles.pageIdentity}>
          {ownsTitle ? (
            <h1 className={styles.title}>{sectionLabel(pathname, t)}</h1>
          ) : null}
          {showDashboardGreeting ? (
            <p className={styles.subtitle}>{getGreeting(firstName)}</p>
          ) : null}
        </div>
      </div>

      <div className={styles.headerRight}>
        <button
          type="button"
          className={styles.searchTrigger}
          onClick={() => commandPalette?.open()}
          aria-label="Search and command palette"
          title="Search or run commands (Cmd+K / Ctrl+K)"
        >
          <Icon name="search" size={16} />
          <span className={styles.searchTriggerLabel}>Search</span>
          <kbd className={styles.searchKbd}>⌘K</kbd>
        </button>
        {showClock ? <span className={styles.clock}>{time}</span> : null}
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
          <Icon name={isDark ? "sun" : "moon"} size={22} />
        </IconButton>
      </div>
    </header>
  );
}
