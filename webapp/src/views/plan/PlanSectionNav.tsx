import { NavLink, useInRouterContext } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { appPath } from "../../lib/appUrl";
import styles from "./planSectionNav.module.css";

const PLAN_SECTIONS: ReadonlyArray<{
  label: string;
  path: string;
  icon: IconName;
}> = [
  { label: "Study plan", path: "/plan", icon: "calendar-week" },
  { label: "Availability", path: "/my-week", icon: "calendar" },
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
            end={section.path === "/plan"}
            className={({ isActive }) =>
              `${styles.link}${isActive ? ` ${styles.active}` : ""}`
            }
          >
            {content}
          </NavLink>
        ) : (
          /* Outside a router there is no basename to apply the deployed path
             prefix, so the href is built with it explicitly — a bare
             `/plan` here would leave this app entirely. */
          <a key={section.path} href={appPath(section.path)} className={styles.link}>
            {content}
          </a>
        );
      })}
    </nav>
  );
}
