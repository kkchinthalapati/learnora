import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { useAuth } from "../context/auth";
import { useAppearance } from "../context/appearance";
import { useOptionalCommandPalette } from "../context/commandPalette";
import { useOptionalChat } from "../context/chat";
import { useLiveClock } from "../hooks/useLiveClock";
import { useTranslation } from "../hooks/useTranslation";
import { getGreeting } from "../lib/greeting";
import { sectionLabel, viewOwnsPageTitle } from "../lib/sectionLabel";
import { resolveDark, THEME_KEY } from "../lib/appearance";
import { Storage } from "../lib/storage";
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
  const { appearance, setAppearance } = useAppearance();
  const commandPalette = useOptionalCommandPalette();
  const chat = useOptionalChat();
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
        <HelpCenter />
        {/* The only always-visible way into the tutor. Everything else that
            opened it was conditional: the dashboard's AI actions card sits
            behind a layout section that ships off, and the command palette
            needs you to know it exists and to type `ai:`. A student who
            wants to ask a question should not have to learn a shortcut. */}
        {chat ? (
          <button
            type="button"
            className={styles.askTrigger}
            onClick={() => chat.open()}
            aria-label="Ask AI"
            title="Ask Learnora's AI a question"
          >
            <Icon name="sparkles" size={16} />
            <span className={styles.askTriggerLabel}>Ask AI</span>
          </button>
        ) : null}
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
