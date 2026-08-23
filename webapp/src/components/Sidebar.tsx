import { Link, NavLink, useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import type { IconName } from "./icons";
import { useCreateModal } from "../context/createModal";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
import { useIncomingFriendRequestCount } from "../hooks/useFriends";
import { useTranslation } from "../hooks/useTranslation";
import { isLibrarySection } from "../lib/sectionLabel";
import type { TranslationKey } from "../lib/i18n";
import styles from "./Sidebar.module.css";

/* The main nav — ports index.html:339-411.
 *
 * The vanilla matched the active link by comparing `location.hash` against
 * each `<a>`'s literal `href`, folding every `library-*` sub-tab down to
 * `library` first (js/router.js:130-145) so drilling into a subject, a
 * material's notes, a quiz, or a flashcard review still left "Library"
 * highlighted — none of those pages have their own sidebar entry. React
 * Router's `NavLink` only does literal prefix matching, which covers every
 * item here except that one, so Library alone gets an explicit `match`
 * check instead of relying on `NavLink`'s own comparison.
 *
 * Two vanilla sidebar items are deliberately not here:
 * - The "Learnora AI" nav link. `style.css:4594-4601` hides it with
 *   `display: none !important` ("Hide the redundant Turbo AI tab") — it's
 *   dead UI in the shipped app, not something to port.
 * - The `.sidebar-overlay` mobile backdrop. Defined in CSS but never
 *   referenced by any element or script — unused, not a missing feature. */

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  /** Only set for items the vanilla actually translates (index.html:339-411
   *  — "This week's plan" and "Exams" have no `data-i18n` there either, so
   *  they stay plain English literals here too). */
  translationKey?: TranslationKey;
}

/* Dashboard and Library are handled separately below — Dashboard needs
   `end` (every route is a "prefix match" of "/"), and Library needs the
   `isLibrarySection` check above instead of NavLink's own comparison. Every
   other item here is a plain, unambiguous path prefix. */
const NAV_ITEMS: NavItem[] = [
  { to: "/analytics", icon: "activity", label: "Analytics" },
  { to: "/timer", icon: "clock", label: "Timer", translationKey: "nav_timer" },
  {
    to: "/tasks",
    icon: "list-checks",
    label: "Task Manager",
    translationKey: "nav_tasks",
  },
  { to: "/plan", icon: "calendar", label: "This week's plan" },
  { to: "/exams", icon: "calendar", label: "Exams" },
  { to: "/room", icon: "users", label: "Study Room" },
  /* Plain English like its two neighbours above: i18n.js has no key for this
     feature, and inventing one here would leave every non-English locale
     falling through to the key name. */
  { to: "/friends", icon: "users", label: "Friends" },
];

export function Sidebar({
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  /** Called whenever a nav link or the Create button is activated, so the
   *  shell can auto-close the mobile drawer the same way the vanilla did
   *  (js/main.js:732-738: adds `.collapsed` back on mobile after a click). */
  onNavigate: () => void;
  /** Same handler as Header's own menu toggle — this is a second entry
   *  point to the identical `collapsed` state, not a separate concept.
   *  Desktop-only in the rendered markup below: on desktop, `collapsed`
   *  now means "retracted to an icon rail" (see Sidebar.module.css) rather
   *  than fully hidden, so a control that lives *on* the rail itself (not
   *  just in the header) is worth having — that's the whole idiom behind
   *  a "retractable" sidebar. Mobile keeps relying on Header's hamburger
   *  only, since off-canvas open/close doesn't have an equivalent
   *  in-sidebar affordance to attach one to before it's even on screen. */
  onToggleCollapse: () => void;
}) {
  const { pathname } = useLocation();
  const { openCreateModal } = useCreateModal();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { data: incomingRequestCount = 0 } = useIncomingFriendRequestCount();
  const t = useTranslation();

  const classes = [styles.sidebar, collapsed ? styles.collapsed : null]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={classes} aria-label="Main navigation">
      <div className={styles.brandRow}>
        <h2 className={styles.brand}>Learnora</h2>
        <IconButton
          className={styles.collapseToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <Icon
            name="chevron-down"
            size={16}
            className={collapsed ? styles.chevronExpand : styles.chevronCollapse}
          />
        </IconButton>
      </div>
      <ul className={styles.navLinks}>
        <li>
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            aria-label={t("nav_dashboard")}
            title={t("nav_dashboard")}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.active : ""}`
            }
          >
            <Icon name="dashboard" size={20} />
            <span className={styles.navLabel}>{t("nav_dashboard")}</span>
          </NavLink>
        </li>
        <hr className={styles.divider} />
        <li>
          {/* Not a NavLink: it opens the create modal rather than routing,
              so it must never take the active state — same reasoning as
              the vanilla's `.nav-create-btn` (index.html:350-352). */}
          <button
            type="button"
            className={styles.createBtn}
            aria-label={t("nav_create")}
            title={t("nav_create")}
            onClick={() => {
              openCreateModal();
              onNavigate();
            }}
          >
            <Icon name="plus" size={20} />
            <span className={styles.navLabel}>{t("nav_create")}</span>
          </button>
        </li>
        <li>
          {/* A plain Link, not NavLink: NavLink's own `isActive`/
              `aria-current` only ever compares against "/library" itself,
              so a subject, a note, a quiz or a review screen — none of
              which have a sidebar entry — would visually highlight this
              item (via the className check below) without marking it
              `aria-current` for assistive tech. Setting it explicitly from
              the same `isLibrarySection` check keeps the two in sync. */}
          <Link
            to="/library"
            onClick={onNavigate}
            aria-current={isLibrarySection(pathname) ? "page" : undefined}
            aria-label={t("nav_library")}
            title={t("nav_library")}
            className={`${styles.navLink} ${isLibrarySection(pathname) ? styles.active : ""}`}
          >
            <Icon name="layers" size={20} />
            <span className={styles.navLabel}>{t("nav_library")}</span>
            {dueCount > 0 ? (
              <span className={styles.badge}>{dueCount}</span>
            ) : null}
          </Link>
        </li>
        <hr className={styles.divider} />
        {NAV_ITEMS.map((item) => {
          const label = item.translationKey ? t(item.translationKey) : item.label;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ""}`
                }
              >
                <Icon name={item.icon} size={20} />
                <span className={styles.navLabel}>{label}</span>
                {item.to === "/friends" && incomingRequestCount > 0 ? (
                  <span className={styles.badge}>{incomingRequestCount}</span>
                ) : null}
              </NavLink>
            </li>
          );
        })}
        <hr className={styles.divider} />
        <li>
          <NavLink
            to="/settings"
            onClick={onNavigate}
            aria-label={t("nav_settings")}
            title={t("nav_settings")}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.active : ""}`
            }
          >
            <Icon name="settings" size={20} />
            <span className={styles.navLabel}>{t("nav_settings")}</span>
          </NavLink>
        </li>
        <li>
          {/* Link, not a raw <a href>: the route table is mounted under a
              basename in production (see AuthShell's own Terms link for the
              same reasoning), and only Link accounts for it. */}
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Terms of Service"
            title="Terms of Service"
            className={`${styles.navLink} ${styles.termsLink}`}
          >
            <Icon name="file-text" size={18} />
            <span className={styles.navLabel}>Terms of Service</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
