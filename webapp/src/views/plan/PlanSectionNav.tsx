import { NavLink, useInRouterContext } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import styles from "./planSectionNav.module.css";

const PLAN_SECTIONS: ReadonlyArray<{
  label: string;
  path: string;
  icon: IconName;
}> = [
  { label: "Week", path: "/plan", icon: "calendar-week" },
  { label: "Tasks", path: "/tasks", icon: "list-checks" },
  { label: "Exams", path: "/exams", icon: "calendar" },
];

export function PlanSectionNav() {
  const isWithinRouter = useInRouterContext();

  return (
    <nav className={styles.nav} aria-label="Plan sections">
      {PLAN_SECTIONS.map((section) => {
        const content = (
          <>
            <Icon name={section.icon} size={16} />
            <span>{section.label}</span>
          </>
        );

        return isWithinRouter ? (
          <NavLink
            key={section.path}
            to={section.path}
            end
            className={({ isActive }) =>
              `${styles.link}${isActive ? ` ${styles.active}` : ""}`
            }
          >
            {content}
          </NavLink>
        ) : (
          <a key={section.path} href={section.path} className={styles.link}>
            {content}
          </a>
        );
      })}
    </nav>
  );
}
