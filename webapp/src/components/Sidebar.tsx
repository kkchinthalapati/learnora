import { Link, NavLink, useLocation } from "react-router";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { useCreateModal } from "../context/createModal";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
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
  { to: "/timer", icon: "clock", label: "Timer", translationKey: "nav_timer" },
  {
    to: "/tasks",
    icon: "list-checks",
    label: "Task Manager",
    translationKey: "nav_tasks",
  },
  { to: "/plan", icon: "calendar", label: "This week's plan" },
  { to: "/exams", icon: "calendar", label: "Exams" },
];

export function Sidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  /** Called whenever a nav link or the Create button is activated, so the
   *  shell can auto-close the mobile drawer the same way the vanilla did
   *  (js/main.js:732-738: adds `.collapsed` back on mobile after a click). */
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  const { openCreateModal } = useCreateModal();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const t = useTranslation();

  const classes = [styles.sidebar, collapsed ? styles.collapsed : null]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={classes} aria-label="Main navigation">
      <h2 className={styles.brand}>Learnora</h2>
      <ul className={styles.navLinks}>
        <li>
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.active : ""}`
            }
          >
            <Icon name="dashboard" size={20} />
            <span>{t("nav_dashboard")}</span>
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
            onClick={() => {
              openCreateModal();
              onNavigate();
            }}
          >
            <Icon name="plus" size={20} />
            <span>{t("nav_create")}</span>
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
            className={`${styles.navLink} ${isLibrarySection(pathname) ? styles.active : ""}`}
          >
            <Icon name="layers" size={20} />
            <span>{t("nav_library")}</span>
            {dueCount > 0 ? (
              <span className={styles.badge}>{dueCount}</span>
            ) : null}
          </Link>
        </li>
        <hr className={styles.divider} />
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ""}`
              }
            >
              <Icon name={item.icon} size={20} />
              <span>{item.translationKey ? t(item.translationKey) : item.label}</span>
            </NavLink>
          </li>
        ))}
        <hr className={styles.divider} />
        <li>
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.active : ""}`
            }
          >
            <Icon name="settings" size={20} />
            <span>{t("nav_settings")}</span>
          </NavLink>
        </li>
        <li>
          {/* Link, not a raw <a href>: the route table is mounted under a
              basename in production (see AuthShell's own Terms link for the
              same reasoning), and only Link accounts for it. */}
          <Link
            to="/terms"
            target="_blank"
            rel="noreferrer"
            className={`${styles.navLink} ${styles.termsLink}`}
          >
            <Icon name="file-text" size={18} />
            <span>Terms of Service</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
