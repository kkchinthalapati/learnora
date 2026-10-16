import { NavLink, useInRouterContext } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { appPath } from "../../lib/appUrl";
import tabs from "../../components/Tabs.module.css";

/* The Plan page's header (webapp/DESIGN.md 0.3-0.4): one title for the four
 * planner pages, and their sections as the same tab strip every other page
 * with parts uses. They are separate routes, so the strip is links with
 * aria-current rather than a tablist. Reached from Subjects, which shows each
 * subject's share of the week. */

const PLAN_SECTIONS: ReadonlyArray<{ label: string; path: string }> = [
  { label: "Week plan", path: "/plan" },
  { label: "Free time", path: "/my-week" },
  { label: "Tasks", path: "/tasks" },
  { label: "Exams", path: "/exams" },
];

export function PlanSectionNav() {
  const isWithinRouter = useInRouterContext();

  return (
    <>
      <PageHeader
        as="h1"
        title="Plan"
        sub="Your week of study, the free time it fits into, your tasks and your exams."
      />
      <nav className={tabs.strip} aria-label="Plan sections">
        {PLAN_SECTIONS.map((section) =>
          isWithinRouter ? (
            <NavLink
              key={section.path}
              to={section.path}
              end={section.path === "/plan"}
              className={({ isActive }) => `${tabs.tab}${isActive ? ` ${tabs.selected}` : ""}`}
            >
              {section.label}
            </NavLink>
          ) : (
            /* Outside a router there is no basename to apply the deployed path
               prefix, so the href is built with it explicitly — a bare
               `/plan` here would leave this app entirely. */
            <a key={section.path} href={appPath(section.path)} className={tabs.tab}>
              {section.label}
            </a>
          ),
        )}
      </nav>
    </>
  );
}
