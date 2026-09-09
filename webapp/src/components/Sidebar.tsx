import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { BrandLogo } from "./BrandLogo";
import type { IconName } from "./icons";
import { useCreateModal } from "../context/createModal";
import { useOptionalAuth } from "../context/auth";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
import { useIncomingFriendRequestCount } from "../hooks/useFriends";
import { useTranslation } from "../hooks/useTranslation";
import {
  primaryDestinationForPath,
  type PrimaryDestination,
} from "../lib/sectionLabel";
import type { TranslationKey } from "../lib/i18n";
import { Storage } from "../lib/storage";
import styles from "./Sidebar.module.css";

export const SIDEBAR_SECTIONS_STORAGE_KEY =
  "learnora_sidebar_collapsed_sections";

export type SectionId = "workspace" | "community" | "account";

interface NavItemConfig {
  to: string;
  icon: IconName;
  label: string;
  translationKey?: TranslationKey;
  destination?: PrimaryDestination;
  badgeType?: "due_flashcards" | "friend_requests";
  opensNewTab?: boolean;
  /* Revealed only while this section is the active one. The rail stays short
     for the common case, and the pages that hang off a section stop being
     reachable exclusively through a sub-nav you cannot see until you have
     already arrived — which is how /tasks, /exams, /my-week and /trajectory
     ended up findable only by typing a URL or opening the command palette. */
  children?: Array<{ to: string; label: string }>;
}

interface NavSection {
  id: SectionId;
  title: string;
  collapsible: boolean;
  items: NavItemConfig[];
}

const SECTIONS: NavSection[] = [
  {
    id: "workspace",
    title: "Workspace",
    collapsible: false,
    items: [
      {
        to: "/",
        icon: "dashboard",
        label: "Dashboard",
        translationKey: "nav_dashboard",
        destination: "dashboard",
      },
      {
        to: "/library",
        icon: "layers",
        label: "Library",
        translationKey: "nav_library",
        destination: "library",
        badgeType: "due_flashcards",
      },
      {
        to: "/plan",
        icon: "calendar",
        label: "Plan",
        destination: "plan",
        children: [
          { to: "/my-week", label: "My week" },
          { to: "/tasks", label: "Tasks" },
          { to: "/exams", label: "Exams" },
        ],
      },
      {
        to: "/timer",
        icon: "clock",
        label: "Focus",
        destination: "focus",
      },
      {
        to: "/analytics",
        icon: "activity",
        label: "Progress",
        destination: "progress",
        children: [{ to: "/trajectory", label: "Trajectory" }],
      },
      {
        to: "/study",
        icon: "target",
        label: "Study Lab",
        destination: "study_lab",
        children: [
          { to: "/solver", label: "Step-by-step solver" },
          { to: "/feynman", label: "Explain it simply" },
          { to: "/viva", label: "Viva practice" },
          { to: "/exam-detective", label: "Exam traps" },
        ],
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    collapsible: true,
    items: [
      { to: "/room", icon: "users", label: "Study Room" },
      {
        to: "/friends",
        icon: "users",
        label: "Friends",
        badgeType: "friend_requests",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    collapsible: true,
    items: [
      {
        to: "/settings",
        icon: "settings",
        label: "Settings",
        translationKey: "nav_settings",
      },
      {
        to: "/terms",
        icon: "file-text",
        label: "Terms of Service",
        opensNewTab: true,
      },
    ],
  },
];

const DEFAULT_COLLAPSED_SECTIONS: SectionId[] = ["community", "account"];

function restoreCollapsedSections(storedValue: unknown): SectionId[] {
  if (!Array.isArray(storedValue)) return DEFAULT_COLLAPSED_SECTIONS;

  const renamedSections: Record<string, SectionId | undefined> = {
    community: "community",
    system: "account",
    account: "account",
  };
  const restored = [
    ...new Set(
      storedValue
        .filter(
          (sectionId): sectionId is string => typeof sectionId === "string",
        )
        .map((sectionId) => renamedSections[sectionId])
        .filter((sectionId): sectionId is SectionId => Boolean(sectionId)),
    ),
  ];

  return storedValue.length > 0 && restored.length === 0
    ? DEFAULT_COLLAPSED_SECTIONS
    : restored;
}

/* Every `to` in the rail, so a destination match can tell "no item owns this
   path, highlight the parent" apart from "a sibling owns it exactly". */
const NAV_PATHS = SECTIONS.flatMap((section) =>
  section.items.map((item) => item.to),
);

function pathOwnedBy(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/* `destination` exists so a sub-route (say /plan/edit) keeps its parent lit.
   It cannot be the whole test: Plan, Tasks and Exams deliberately share the
   "plan" destination, so matching on it alone marked all three aria-current
   ="page" at once on every one of those routes — three highlighted rows, and
   a screen reader announcing three current pages. An item's own path wins
   first; the destination is only a fallback for paths no item claims. */
function routeMatchesItem(pathname: string, item: NavItemConfig): boolean {
  if (pathOwnedBy(pathname, item.to)) return true;
  if (!item.destination) return false;
  if (NAV_PATHS.some((to) => pathOwnedBy(pathname, to))) return false;
  return primaryDestinationForPath(pathname) === item.destination;
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
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const session = auth?.session;
  const { openCreateModal } = useCreateModal();
  const { data: dueCount = 0, isPending: duePending } = useFlashcardsDueCount({
    enabled: Boolean(session),
  });
  const { data: incomingRequestCount = 0, isPending: requestsPending } =
    useIncomingFriendRequestCount({
      enabled: Boolean(session),
    });
  const t = useTranslation();

  const [collapsedSections, setCollapsedSections] = useState<SectionId[]>(() =>
    restoreCollapsedSections(
      Storage.get<unknown>(
        SIDEBAR_SECTIONS_STORAGE_KEY,
        DEFAULT_COLLAPSED_SECTIONS,
      ),
    ),
  );
  const toggleSection = (sectionId: SectionId) => {
    setCollapsedSections((currentSections) => {
      const nextSections = currentSections.includes(sectionId)
        ? currentSections.filter((currentId) => currentId !== sectionId)
        : [...currentSections, sectionId];
      Storage.set(SIDEBAR_SECTIONS_STORAGE_KEY, nextSections);
      return nextSections;
    });
  };

  const sidebarClasses = [
    styles.sidebar,
    railCollapsed ? styles.railCollapsed : null,
    drawerOpen ? styles.drawerOpen : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={sidebarClasses} aria-label="Main navigation">
      <div className={styles.brandRow}>
        <Link to="/" className={styles.brand} onClick={onNavigate}>
          <span className={styles.brandMark} aria-hidden="true">
            <BrandLogo size="small" />
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

      <button
        type="button"
        className={styles.createBtn}
        aria-label={t("nav_create")}
        title={t("nav_create")}
        onClick={() => {
          if (!session) {
            onNavigate();
            void navigate("/signup");
            return;
          }
          openCreateModal();
          onNavigate();
        }}
      >
        <Icon name="plus" size={18} />
        <span className={styles.navLabel}>{t("nav_create")}</span>
      </button>

      <div className={styles.sectionsContainer}>
        {SECTIONS.map((section) => {
          const isCollapsed = collapsedSections.includes(section.id);
          return (
            <div
              key={section.id}
              className={styles.sectionGroup}
              role="group"
              aria-label={section.title}
            >
              {section.collapsible ? (
                <button
                  type="button"
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${section.title}`}
                >
                  <span>{section.title}</span>
                  <Icon
                    name="chevron-down"
                    size={12}
                    className={`${styles.sectionChevron} ${
                      isCollapsed ? styles.sectionChevronCollapsed : ""
                    }`}
                  />
                </button>
              ) : (
                <p className={styles.sectionLabel}>{section.title}</p>
              )}

              <ul
                className={`${styles.navLinks} ${
                  isCollapsed ? styles.navLinksHidden : ""
                }`}
              >
                {section.items.map((item) => {
                  const label = item.translationKey
                    ? t(item.translationKey)
                    : item.label;
                  const isActive = routeMatchesItem(pathname, item);
                  const badgeCount =
                    item.badgeType === "due_flashcards"
                      ? dueCount
                      : item.badgeType === "friend_requests"
                        ? incomingRequestCount
                        : 0;
                  /* `data: x = 0` reads as "zero due" while the count is
                     still in flight, so the badge was absent on first paint
                     and then appeared. Hold its slot until the answer is
                     actually known. */
                  const badgePending =
                    item.badgeType === "due_flashcards"
                      ? duePending
                      : item.badgeType === "friend_requests"
                        ? requestsPending
                        : false;

                  /* Exactly one link may be aria-current="page". When a
                     child route is open the child is the current page, and
                     the parent is merely the section containing it. */
                  const currentChild = item.children?.some((child) =>
                    pathOwnedBy(pathname, child.to),
                  );

                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        target={item.opensNewTab ? "_blank" : undefined}
                        rel={
                          item.opensNewTab ? "noopener noreferrer" : undefined
                        }
                        onClick={item.opensNewTab ? undefined : onNavigate}
                        aria-current={
                          isActive && !currentChild ? "page" : undefined
                        }
                        aria-label={label}
                        title={label}
                        className={`${styles.navLink} ${
                          isActive ? styles.active : ""
                        }`}
                      >
                        <Icon name={item.icon} size={18} />
                        <span className={styles.navLabel}>{label}</span>
                        {badgePending ? (
                          <span
                            className={`${styles.badge} ${styles.badgePlaceholder}`}
                            aria-hidden="true"
                          />
                        ) : badgeCount > 0 ? (
                          <span className={styles.badge}>{badgeCount}</span>
                        ) : null}
                      </Link>
                      {item.children && isActive && !railCollapsed ? (
                        <ul className={styles.subLinks}>
                          {item.children.map((child) => (
                            <li key={child.to}>
                              <Link
                                to={child.to}
                                onClick={onNavigate}
                                aria-current={
                                  pathOwnedBy(pathname, child.to)
                                    ? "page"
                                    : undefined
                                }
                                className={`${styles.subLink} ${
                                  pathOwnedBy(pathname, child.to)
                                    ? styles.subLinkActive
                                    : ""
                                }`}
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
