import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { HelpCenter } from "./HelpCenter";
import { LearnoraMark } from "./LearnoraMark";
import { useOptionalAuth } from "../context/auth";
import { useOptionalChat } from "../context/chat";
import { useOptionalCommandPalette } from "../context/commandPalette";
import { useContinuity } from "../hooks/useContinuity";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
import { useIncomingFriendRequestCount } from "../hooks/useFriends";
import { pausedStudySession } from "../lib/continuity";
import { topDestinationForPath, type TopDestination } from "../lib/sectionLabel";
import styles from "./TopBar.module.css";

/* The one navigation in the app (DESIGN.md rule 0.2): Home · Subjects ·
 * Progress, then search, Ask, the focus timer and the profile menu. It
 * replaced a five-item sidebar whose Plan and Progress rows opened a second
 * list of links underneath — two levels of navigation for one app.
 *
 * Everything the sidebar carried is still here: the due-cards count (on
 * Subjects), the paused-session card (a Resume chip), study room and
 * friends with the request count, settings and sign out (profile menu). */

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl ";

export const TOP_DESTINATIONS: ReadonlyArray<{
  to: string;
  label: string;
  icon: IconName;
  destination: TopDestination;
}> = [
  { to: "/", label: "Home", icon: "dashboard", destination: "home" },
  { to: "/subjects", label: "Subjects", icon: "layers", destination: "subjects" },
  { to: "/analytics", label: "Progress", icon: "activity", destination: "progress" },
];

/* The top bar's destinations plus its timer and the profile menu's
   Settings — the places the tutor can also send a student (chatActions'
   NAVIGATE test checks each one). */
export const NAV_PATHS = [...TOP_DESTINATIONS.map((d) => d.to), "/timer", "/settings"];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? "";
  return letters.toUpperCase() || "?";
}

export function TopBar() {
  const { pathname } = useLocation();
  const auth = useOptionalAuth();
  const session = auth?.session;
  const chat = useOptionalChat();
  const commandPalette = useOptionalCommandPalette();
  const { snapshot } = useContinuity();
  const paused = pausedStudySession(snapshot);
  const current = topDestinationForPath(pathname);
  const { data: dueCount = 0 } = useFlashcardsDueCount({ enabled: Boolean(session) });
  const { data: requests = 0 } = useIncomingFriendRequestCount({ enabled: Boolean(session) });
  const fullName =
    (auth?.user?.user_metadata?.full_name as string | undefined)?.trim() ||
    auth?.user?.email?.split("@")[0] ||
    "";

  return (
    <>
      <header className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="Learnora, home">
          <LearnoraMark size={30} className={styles.brandMark} />
          <span className={styles.brandName}>Learnora</span>
        </Link>

        <nav className={styles.nav} aria-label="Main navigation">
          {TOP_DESTINATIONS.map((item) => {
            const active = current === item.destination;
            const exact = active && pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`${styles.navLink} ${active ? styles.active : ""}`}
                aria-current={exact ? "page" : active ? "true" : undefined}
              >
                {item.label}
                {item.destination === "subjects" && dueCount > 0 ? (
                  <span className={styles.badge}>
                    {dueCount}
                    <span className={styles.srOnly}> cards due</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className={styles.tools}>
          {paused ? (
            <Link
              to={`/study/${encodeURIComponent(paused.id)}?mode=${encodeURIComponent(paused.mode)}`}
              className={styles.resume}
              title={`${paused.objective} · step ${Math.min(paused.stepIndex + 1, paused.totalSteps)} of ${paused.totalSteps}`}
            >
              <Icon name="play" size={14} />
              <span>Resume session</span>
            </Link>
          ) : null}
          {commandPalette ? (
            <button
              type="button"
              className={styles.tool}
              onClick={() => commandPalette.open()}
              aria-label="Search"
              title={`Search (${MOD}K)`}
            >
              <Icon name="search" size={18} />
            </button>
          ) : null}
          {chat ? (
            <button
              type="button"
              className={`${styles.tool} ${styles.ask}`}
              onClick={() => chat.open()}
              aria-label="Ask the tutor"
              title={`Ask the tutor (${MOD}J)`}
            >
              <Icon name="pencil" size={18} />
              <span className={styles.toolLabel}>Ask</span>
            </button>
          ) : null}
          <Link
            to="/timer"
            className={`${styles.tool} ${pathname.startsWith("/timer") ? styles.toolActive : ""}`}
            aria-label="Focus timer"
            title="Focus timer"
            aria-current={pathname.startsWith("/timer") ? "page" : undefined}
          >
            <Icon name="clock" size={18} />
          </Link>
          <HelpCenter />
          {session ? (
            <ProfileMenu
              name={fullName}
              email={auth?.user?.email ?? ""}
              requests={requests}
              onSignOut={() => void auth?.signOut()}
            />
          ) : (
            <Link to="/login" className={styles.signIn}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <nav className={styles.bottomBar} aria-label="Main navigation, phone">
        {TOP_DESTINATIONS.map((item) => {
          const active = current === item.destination;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`${styles.bottomTab} ${active ? styles.bottomActive : ""}`}
              aria-current={active && pathname === item.to ? "page" : undefined}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/* Avatar button → the account's places. Sign out is a deliberate step in a
   menu, never a bare icon one mis-tap from ending the session. */
function ProfileMenu({
  name,
  email,
  requests,
  onSignOut,
}: {
  name: string;
  email: string;
  requests: number;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.profile} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={name ? `${name}, account menu` : "Account menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {initialsOf(name)}
        {requests > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className={styles.menu} id={menuId} role="menu" aria-label="Account">
          <div className={styles.menuHead}>
            <span className={styles.menuName}>{name || "Your account"}</span>
            {email ? <span className={styles.menuEmail}>{email}</span> : null}
          </div>
          <Link role="menuitem" to="/settings" className={styles.menuItem}>
            <Icon name="settings" size={16} />
            Settings
          </Link>
          <Link role="menuitem" to="/room" className={styles.menuItem}>
            <Icon name="users" size={16} />
            Study room and friends
            {requests > 0 ? (
              <span className={styles.badge}>
                {requests}
                <span className={styles.srOnly}> friend requests</span>
              </span>
            ) : null}
          </Link>
          <Link role="menuitem" to="/terms" className={styles.menuItem}>
            <Icon name="file-text" size={16} />
            Terms
          </Link>
          <hr className={styles.menuRule} />
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <Icon name="log-out" size={16} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
