import { useState } from "react";
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
import { Storage } from "../lib/storage";
import styles from "./Sidebar.module.css";

export const SIDEBAR_SECTIONS_STORAGE_KEY = "learnora_sidebar_collapsed_sections";

export type SectionId = "core" | "ai_lab" | "execution" | "community" | "system";

export interface NavItemConfig {
  to?: string;
  icon: IconName;
  label: string;
  translationKey?: TranslationKey;
  isCreateAction?: boolean;
  isLibrary?: boolean;
  badgeType?: "due_flashcards" | "friend_requests";
}

export interface NavSection {
  id: SectionId;
  title: string;
  items: NavItemConfig[];
}

const SECTIONS: NavSection[] = [
  {
    id: "core",
    title: "Core Learning",
    items: [
      {
        to: "/",
        icon: "dashboard",
        label: "Dashboard",
        translationKey: "nav_dashboard",
      },
      {
        isCreateAction: true,
        icon: "plus",
        label: "Create",
        translationKey: "nav_create",
      },
      {
        to: "/library",
        icon: "layers",
        label: "Library",
        translationKey: "nav_library",
        isLibrary: true,
        badgeType: "due_flashcards",
      },
      {
        to: "/graph",
        icon: "share-2",
        label: "Concept Graph",
      },
    ],
  },
  {
    id: "ai_lab",
    title: "AI Cognitive Lab",
    items: [
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
      {
        to: "/analytics",
        icon: "activity",
        label: "Analytics",
      },
    ],
  },
  {
    id: "execution",
    title: "Execution & Routine",
    items: [
      {
        to: "/timer",
        icon: "clock",
        label: "Timer",
        translationKey: "nav_timer",
      },
      {
        to: "/tasks",
        icon: "list-checks",
        label: "Task Manager",
        translationKey: "nav_tasks",
      },
      {
        to: "/plan",
        icon: "calendar",
        label: "This week's plan",
      },
      {
        to: "/exams",
        icon: "calendar",
        label: "Exams",
      },
    ],
  },
  {
    id: "community",
    title: "Community & Social",
    items: [
      {
        to: "/room",
        icon: "users",
        label: "Study Room",
      },
      {
        to: "/friends",
        icon: "users",
        label: "Friends",
        badgeType: "friend_requests",
      },
    ],
  },
  {
    id: "system",
    title: "System",
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
      },
    ],
  },
];

export function Sidebar({
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onNavigate: () => void;
  onToggleCollapse: () => void;
}) {
  const { pathname } = useLocation();
  const { openCreateModal } = useCreateModal();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { data: incomingRequestCount = 0 } = useIncomingFriendRequestCount();
  const t = useTranslation();

  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => {
    return Storage.get<string[]>(SIDEBAR_SECTIONS_STORAGE_KEY, []) || [];
  });

  const toggleSection = (sectionId: SectionId) => {
    setCollapsedSections((prev) => {
      const next = prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId];
      Storage.set(SIDEBAR_SECTIONS_STORAGE_KEY, next);
      return next;
    });
  };

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

      <div className={styles.sectionsContainer}>
        {SECTIONS.map((section, sectionIdx) => {
          const isSectionCollapsed = collapsedSections.includes(section.id);

          return (
            <div
              key={section.id}
              className={styles.sectionGroup}
              role="group"
              aria-label={section.title}
            >
              {sectionIdx > 0 && <hr className={styles.divider} />}

              <button
                type="button"
                className={styles.sectionHeader}
                onClick={() => toggleSection(section.id)}
                aria-expanded={!isSectionCollapsed}
                aria-label={`${isSectionCollapsed ? "Expand" : "Collapse"} ${section.title}`}
                title={`${isSectionCollapsed ? "Expand" : "Collapse"} ${section.title}`}
              >
                <span className={styles.sectionTitle}>{section.title}</span>
                <Icon
                  name="chevron-down"
                  size={12}
                  className={`${styles.sectionChevron} ${
                    isSectionCollapsed ? styles.sectionChevronCollapsed : ""
                  }`}
                />
              </button>

              <ul
                className={`${styles.navLinks} ${
                  isSectionCollapsed && !collapsed ? styles.navLinksHidden : ""
                }`}
              >
                {section.items.map((item) => {
                  const label = item.translationKey
                    ? t(item.translationKey)
                    : item.label;

                  // 1. Create Modal Button
                  if (item.isCreateAction) {
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          className={styles.createBtn}
                          aria-label={label}
                          title={`${label} — ${section.title}`}
                          onClick={() => {
                            openCreateModal();
                            onNavigate();
                          }}
                        >
                          <Icon name={item.icon} size={18} />
                          <span className={styles.navLabel}>{label}</span>
                        </button>
                      </li>
                    );
                  }

                  // 2. Library Special Link
                  if (item.isLibrary && item.to) {
                    const isLibActive = isLibrarySection(pathname);
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={onNavigate}
                          aria-current={isLibActive ? "page" : undefined}
                          aria-label={label}
                          title={`${label} — ${section.title}`}
                          className={`${styles.navLink} ${
                            isLibActive ? styles.active : ""
                          }`}
                        >
                          <Icon name={item.icon} size={18} />
                          <span className={styles.navLabel}>{label}</span>
                          {dueCount > 0 ? (
                            <span className={styles.badge}>{dueCount}</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  }

                  // 3. Terms of Service Link
                  if (item.to === "/terms") {
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Terms of Service"
                          title="Terms of Service — System"
                          className={`${styles.navLink} ${styles.termsLink}`}
                        >
                          <Icon name={item.icon} size={18} />
                          <span className={styles.navLabel}>Terms of Service</span>
                        </Link>
                      </li>
                    );
                  }

                  // 4. Standard NavLink
                  if (item.to) {
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === "/"}
                          onClick={onNavigate}
                          aria-label={label}
                          title={`${label} — ${section.title}`}
                          className={({ isActive }) =>
                            `${styles.navLink} ${isActive ? styles.active : ""}`
                          }
                        >
                          <Icon name={item.icon} size={18} />
                          <span className={styles.navLabel}>{label}</span>
                          {item.badgeType === "friend_requests" &&
                          incomingRequestCount > 0 ? (
                            <span className={styles.badge}>
                              {incomingRequestCount}
                            </span>
                          ) : null}
                        </NavLink>
                      </li>
                    );
                  }

                  return null;
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
