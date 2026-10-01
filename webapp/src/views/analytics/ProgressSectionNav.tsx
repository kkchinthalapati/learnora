import { NavLink } from "react-router";
import { Icon } from "../../components/Icon";
import styles from "./progressSectionNav.module.css";

const PROGRESS_SECTIONS = [
  { label: "History", path: "/analytics", icon: "activity" as const },
  { label: "Exam forecast", path: "/trajectory", icon: "target" as const },
];

export function ProgressSectionNav() {
  return (
    <nav className={styles.nav} aria-label="Progress sections">
      {PROGRESS_SECTIONS.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          className={({ isActive }) =>
            `${styles.link}${isActive ? ` ${styles.active}` : ""}`
          }
        >
          <Icon name={section.icon} size={16} />
          <span>{section.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
