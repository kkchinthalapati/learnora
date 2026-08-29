import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import type { IconName } from "./icons";
import { useCreateModal } from "../context/createModal";
import { useFlashcardsDueCount } from "../hooks/useFlashcards";
import { useIncomingFriendRequestCount } from "../hooks/useFriends";
import { useTranslation } from "../hooks/useTranslation";
import {
  isCommunitySection,
  isStudyLabSection,
  primaryDestinationForPath,
  type PrimaryDestination,
} from "../lib/sectionLabel";
import type { TranslationKey } from "../lib/i18n";
import { Storage } from "../lib/storage";
import styles from "./Sidebar.module.css";

export const SIDEBAR_SECTIONS_STORAGE_KEY =
  "learnora_sidebar_collapsed_sections";

export type SectionId = "workspace" | "study_lab" | "community" | "account";

interface NavItemConfig {
  to: string;
  icon: IconName;
  label: string;
  translationKey?: TranslationKey;
  destination?: PrimaryDestination;
  badgeType?: "due_flashcards" | "friend_requests";
  opensNewTab?: boolean;
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
      },
    ],
  },
  {
    id: "study_lab",
    title: "Study Lab",
    collapsible: true,
    items: [
      { to: "/graph", icon: "share-2", label: "Concept Graph" },
      {
        to: "/debugger",
        icon: "brain",
        label: "Cognitive Debugger",
      },
      {
        to: "/feynman",
        icon: "award",
        label: "Feynman Apprentice",
      },
      {
        to: "/premortem",
        icon: "shield",
        label: "Exam Pre-Mortem",
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

const DEFAULT_COLLAPSED_SECTIONS: SectionId[] = [
  "study_lab",
  "community",
  "account",
];

function restoreCollapsedSections(storedValue: unknown): SectionId[] {
  if (!Array.isArray(storedValue)) return DEFAULT_COLLAPSED_SECTIONS;

  const renamedSections: Record<string, SectionId> = {
    ai_lab: "study_lab",
    study_lab: "study_lab",
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

function routeMatchesItem(pathname: string, item: NavItemConfig): boolean {
  if (item.destination) {
    return primaryDestinationForPath(pathname) === item.destination;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function activeSecondarySection(pathname: string): SectionId | null {
  if (isStudyLabSection(pathname)) return "study_lab";
  if (isCommunitySection(pathname)) return "community";
  if (pathname.startsWith("/settings")) return "account";
  return null;
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
  const { openCreateModal } = useCreateModal();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { data: incomingRequestCount = 0 } = useIncomingFriendRequestCount();
  const t = useTranslation();

  const [collapsedSections, setCollapsedSections] = useState<SectionId[]>(() =>
    restoreCollapsedSections(
      Storage.get<unknown>(
        SIDEBAR_SECTIONS_STORAGE_KEY,
        DEFAULT_COLLAPSED_SECTIONS,
      ),
    ),
  );
  const activeSection = activeSecondarySection(pathname);

  const toggleSection = (sectionId: SectionId) => {
    setCollapsedSections((currentSections) => {
      if (sectionId === activeSection) {
        const nextSections = currentSections.filter(
          (currentId) => currentId !== sectionId,
        );
        Storage.set(SIDEBAR_SECTIONS_STORAGE_KEY, nextSections);
        return nextSections;
      }
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
        <Icon name="plus" size={18} />
        <span className={styles.navLabel}>{t("nav_create")}</span>
      </button>

      <div className={styles.sectionsContainer}>
        {SECTIONS.map((section) => {
          const isCollapsed =
            collapsedSections.includes(section.id) &&
            section.id !== activeSection;
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

                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        target={item.opensNewTab ? "_blank" : undefined}
                        rel={
                          item.opensNewTab ? "noopener noreferrer" : undefined
                        }
                        onClick={item.opensNewTab ? undefined : onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={label}
                        title={label}
                        className={`${styles.navLink} ${
                          isActive ? styles.active : ""
                        }`}
                      >
                        <Icon name={item.icon} size={18} />
                        <span className={styles.navLabel}>{label}</span>
                        {badgeCount > 0 ? (
                          <span className={styles.badge}>{badgeCount}</span>
                        ) : null}
                      </Link>
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
