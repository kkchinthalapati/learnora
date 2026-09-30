import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import type { IconName } from "./icons";
import { useOptionalAuth } from "../context/auth";
import { useOptionalChat } from "../context/chat";
import { useOptionalCommandPalette } from "../context/commandPalette";
import { useContinuity } from "../hooks/useContinuity";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
import { useIncomingFriendRequestCount } from "../hooks/useFriends";
import { useTranslation } from "../hooks/useTranslation";
import { pausedStudySession } from "../lib/continuity";
import {
  primaryDestinationForPath,
  type PrimaryDestination,
} from "../lib/sectionLabel";
import type { TranslationKey } from "../lib/i18n";
import styles from "./Sidebar.module.css";

/* The shortcut hint in the platform's own terms: "⌘K" means nothing on the
   Windows and Chromebook laptops most students use. */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl ";

interface NavItemConfig {
  to: string;
  icon: IconName;
  label: string;
  translationKey?: TranslationKey;
  destination: PrimaryDestination;
  badgeType?: "due_flashcards";
  /* Revealed only while this destination is the active one, so the rail
     stays five rows long and the pages that hang off a destination (Tasks,
     Exams, Trajectory…) are still one click away once you are in it. */
  children?: Array<{ to: string; label: string }>;
}

/* Five destinations. Every visit is a session with a goal; the twenty-odd
   places the app used to list (Solver, Feynman, Viva, Dashboard, Timer…)
   regroup under these, and their old URLs redirect (routes.tsx). */
const NAV_ITEMS: NavItemConfig[] = [
  { to: "/", icon: "dashboard", label: "Today", destination: "dashboard" },
  {
    to: "/library",
    icon: "layers",
    label: "Library",
    translationKey: "nav_library",
    destination: "library",
    badgeType: "due_flashcards",
  },
  { to: "/study", icon: "target", label: "Study", destination: "study_lab" },
  {
    to: "/plan",
    icon: "calendar",
    label: "Plan",
    destination: "plan",
    children: [
      { to: "/my-week", label: "Availability" },
      { to: "/tasks", label: "Tasks" },
      { to: "/exams", label: "Exams" },
      { to: "/timer", label: "Focus timer" },
    ],
  },
  {
    to: "/analytics",
    icon: "activity",
    label: "Progress",
    destination: "progress",
    children: [{ to: "/trajectory", label: "Trajectory" }],
  },
];

const NAV_PATHS = NAV_ITEMS.flatMap((item) => [
  item.to,
  ...(item.children ?? []).map((c) => c.to),
]);

function pathOwnedBy(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/* An item's own path wins; the destination is only a fallback for paths no
   item or child claims (a quiz under Library, a Session under Study). */
function routeMatchesItem(pathname: string, item: NavItemConfig): boolean {
  if (pathOwnedBy(pathname, item.to)) return true;
  if (item.children?.some((child) => pathOwnedBy(pathname, child.to))) {
    return true;
  }
  if (NAV_PATHS.some((to) => pathOwnedBy(pathname, to))) return false;
  return primaryDestinationForPath(pathname) === item.destination;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "";
  return letters.toUpperCase() || "?";
}

export function Sidebar({
  railCollapsed,
  drawerOpen,
  onNavigate,
  onToggleRail,
}: {
  railCollapsed: boolean;
  drawerOpen: boolean;
  onNavigate: () => void;
  onToggleRail: () => void;
}) {
  const { pathname } = useLocation();
  const auth = useOptionalAuth();
  const session = auth?.session;
  const chat = useOptionalChat();
  const commandPalette = useOptionalCommandPalette();
  const { snapshot } = useContinuity();
  const paused = pausedStudySession(snapshot);
  const { data: dueCount = 0, isPending: duePending } = useFlashcardsDueCount({
    enabled: Boolean(session),
  });
  const { data: incomingRequestCount = 0 } = useIncomingFriendRequestCount({
    enabled: Boolean(session),
  });
  const t = useTranslation();

  const fullName =
    (auth?.user?.user_metadata?.full_name as string | undefined)?.trim() ||
    auth?.user?.email?.split("@")[0] ||
    "";

  const sidebarClasses = [
    styles.sidebar,
    railCollapsed ? styles.railCollapsed : null,
    drawerOpen ? styles.drawerOpen : null,
  ]
    .filter(Boolean)
    .join(" ");

  const communityCurrent =
    pathOwnedBy(pathname, "/room") || pathOwnedBy(pathname, "/friends");
  const settingsCurrent = pathOwnedBy(pathname, "/settings");

  return (
    <nav className={sidebarClasses} aria-label="Main navigation">
      <div className={styles.brandRow}>
        <Link to="/" className={styles.brand} onClick={onNavigate}>
          <span className={styles.brandMark} aria-hidden="true">
            L
          </span>
          <span className={styles.brandName}>Learnora</span>
        </Link>
        <IconButton
          className={styles.collapseToggle}
          aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!railCollapsed}
          onClick={onToggleRail}
        >
          <Icon
            name="chevron-down"
            size={16}
            className={
              railCollapsed ? styles.chevronExpand : styles.chevronCollapse
            }
          />
        </IconButton>
      </div>

      {commandPalette ? (
        <button
          type="button"
          className={styles.search}
          onClick={() => {
            commandPalette.open();
            onNavigate();
          }}
          aria-label="Search or jump to…"
          title={`Search or jump to… (${MOD}K)`}
        >
          <Icon name="search" size={16} />
          <span className={styles.navLabel}>Search or jump to…</span>
          <kbd className={styles.kbd}>{MOD}K</kbd>
        </button>
      ) : null}

      <ul className={styles.navLinks}>
        {NAV_ITEMS.map((item) => {
          const label = item.translationKey ? t(item.translationKey) : item.label;
          const isActive = routeMatchesItem(pathname, item);
          const currentChild = item.children?.find((child) =>
            pathOwnedBy(pathname, child.to),
          );
          const showBadge = item.badgeType === "due_flashcards";
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                /* Exactly one link is the current page. On a child route the
                   child is; the parent is only the section containing it. */
                aria-current={isActive && !currentChild ? "page" : undefined}
                aria-label={label}
                title={label}
                className={`${styles.navLink} ${isActive ? styles.active : ""}`}
              >
                <Icon name={item.icon} size={18} />
                <span className={styles.navLabel}>{label}</span>
                {showBadge && duePending && session ? (
                  <span
                    className={`${styles.badge} ${styles.badgePlaceholder}`}
                    aria-hidden="true"
                  />
                ) : showBadge && dueCount > 0 ? (
                  <span className={styles.badge}>
                    {dueCount}
                    <span className={styles.srOnly}> cards due</span>
                  </span>
                ) : null}
              </Link>
              {item.children && isActive && !railCollapsed ? (
                <ul className={styles.subLinks}>
                  {item.children.map((child) => {
                    const current = pathOwnedBy(pathname, child.to);
                    return (
                      <li key={child.to}>
                        <Link
                          to={child.to}
                          onClick={onNavigate}
                          aria-current={current ? "page" : undefined}
                          className={`${styles.subLink} ${current ? styles.subLinkActive : ""}`}
                        >
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {chat ? (
        <>
          <hr className={styles.divider} />
          <button
            type="button"
            className={styles.ask}
            onClick={() => {
              chat.open();
              onNavigate();
            }}
            aria-label="Ask the tutor"
            title={`Ask the tutor (${MOD}J)`}
          >
            <Icon name="sparkles" size={18} />
            <span className={styles.navLabel}>Ask the tutor</span>
            <kbd className={styles.kbd}>{MOD}J</kbd>
          </button>
        </>
      ) : null}

      <div className={styles.spacer} />

      {paused && !railCollapsed ? (
        <Link
          to={`/study/${encodeURIComponent(paused.id)}?mode=${encodeURIComponent(paused.mode)}`}
          className={styles.pausedCard}
          onClick={onNavigate}
        >
          <span className={styles.pausedLabel}>Session paused</span>
          <span className={styles.pausedTopic}>{paused.objective}</span>
          <span className={styles.pausedMeta}>
            Step {Math.min(paused.stepIndex + 1, paused.totalSteps)} of{" "}
            {paused.totalSteps} · {paused.minutesLeft} min left
          </span>
          <span className={styles.srOnly}>. Resume</span>
        </Link>
      ) : null}

      <div className={styles.footer}>
        <Link
          to="/room"
          onClick={onNavigate}
          aria-current={communityCurrent ? "page" : undefined}
          aria-label="Study room & friends"
          title="Study room & friends"
          className={`${styles.footerLink} ${communityCurrent ? styles.active : ""}`}
        >
          <Icon name="users" size={16} />
          <span className={styles.navLabel}>Study room & friends</span>
          {incomingRequestCount > 0 ? (
            <span className={styles.badge}>
              {incomingRequestCount}
              <span className={styles.srOnly}> friend requests</span>
            </span>
          ) : null}
        </Link>

        {session ? (
          <AccountRow
            name={fullName}
            settingsCurrent={settingsCurrent}
            onNavigate={onNavigate}
            onSignOut={() => void auth?.signOut()}
          />
        ) : (
          <Link to="/login" className={styles.footerLink} onClick={onNavigate}>
            <Icon name="user" size={16} />
            <span className={styles.navLabel}>Sign in</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

/* Avatar + name links to Settings; the ⋯ beside it holds the two account
   actions that used to take permanent rail rows (Terms, Log out). Log out is
   one deliberate step away, never a bare icon a missed tap can hit. */
function AccountRow({
  name,
  settingsCurrent,
  onNavigate,
  onSignOut,
}: {
  name: string;
  settingsCurrent: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className={styles.accountRow} ref={rowRef}>
      <Link
        to="/settings"
        onClick={onNavigate}
        aria-current={settingsCurrent ? "page" : undefined}
        aria-label={name ? `${name}, Settings` : "Settings"}
        title="Settings"
        className={`${styles.account} ${settingsCurrent ? styles.active : ""}`}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(name)}
        </span>
        <span className={`${styles.accountText} ${styles.navLabel}`}>
          <span className={styles.accountName}>{name || "Your account"}</span>
          <span className={styles.accountSub}>Settings</span>
        </span>
      </Link>
      <IconButton
        className={styles.accountMenuBtn}
        aria-label="Account menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Icon name="chevron-up" size={16} />
      </IconButton>
      {menuOpen ? (
        <ul className={styles.accountMenu} id={menuId}>
          <li>
            <Link
              to="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.menuItem}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="file-text" size={16} />
              Terms of Service
            </Link>
          </li>
          <li>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <Icon name="log-out" size={16} />
              Log out
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
