import type { TranslationKey } from "./i18n";

/* Which top-level "section" a route belongs to, and its label — shared by
 * `Sidebar` (which item gets `.active`) and `Header` (what to show as the
 * current section). One function each, not duplicated per component.
 *
 * The vanilla derived the header's `#page-title` from whichever sidebar
 * link's text matched the current hash (`js/router.js:130-145`,
 * `js/ui.js:689-696`) — subject/notes/quiz/review pages have no sidebar
 * entry of their own, so the vanilla's title (and this one) stays "Library"
 * on all of them, same as it does on `/library` itself.
 *
 * `_updatePageTitle` re-ran on every `applyTranslations()` pass, since the
 * title is just the active nav link's already-translated text — so this
 * takes a `t` the same shape `useTranslation()` returns, and translates
 * exactly the sections the vanilla's sidebar itself translates (see
 * Sidebar.tsx's NAV_ITEMS comment: "This week's plan"/"Exams" have no
 * `data-i18n` there either, so they stay literal here too). */

export function isLibrarySection(pathname: string): boolean {
  return (
    pathname.startsWith("/library") ||
    pathname.startsWith("/folders/") ||
    pathname.startsWith("/notes/") ||
    pathname.startsWith("/quiz/") ||
    pathname.startsWith("/review/")
  );
}

export function isNotebooksSection(pathname: string): boolean {
  return pathname.startsWith("/notebooks");
}

export type PrimaryDestination =
  "dashboard" | "notebooks" | "library" | "plan" | "focus" | "progress";

export function primaryDestinationForPath(
  pathname: string,
): PrimaryDestination | null {
  if (pathname === "/") return "dashboard";
  if (isNotebooksSection(pathname)) return "notebooks";
  if (isLibrarySection(pathname)) return "library";
  if (
    pathname.startsWith("/plan") ||
    pathname.startsWith("/my-week") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/exams")
  ) {
    return "plan";
  }
  if (pathname.startsWith("/timer")) return "focus";
  if (pathname.startsWith("/analytics") || pathname.startsWith("/trajectory"))
    return "progress";
  return null;
}

export function isStudyLabSection(pathname: string): boolean {
  return ["/graph", "/debugger", "/feynman", "/premortem"].some((routePrefix) =>
    pathname.startsWith(routePrefix),
  );
}

export function isCommunitySection(pathname: string): boolean {
  return pathname.startsWith("/room") || pathname.startsWith("/friends");
}

export function sectionLabel(
  pathname: string,
  t: (key: TranslationKey) => string,
): string {
  if (pathname === "/") return t("nav_dashboard");
  if (isNotebooksSection(pathname)) return "Notebooks";
  if (isLibrarySection(pathname)) return t("nav_library");
  if (pathname.startsWith("/timer")) return t("nav_timer");
  if (pathname.startsWith("/tasks")) return t("nav_tasks");
  /* "Progress" everywhere — it is the rail's label and the student's own
     word for this. The page header used to say "Analytics", so one
     destination had two names depending on where you read it. */
  if (pathname.startsWith("/analytics")) return "Progress";
  if (pathname.startsWith("/trajectory")) return "Trajectory";
  if (pathname.startsWith("/graph")) return "How Topics Connect";
  if (pathname.startsWith("/feynman")) return "Explain It Simply";
  if (pathname.startsWith("/debugger")) return "Find My Mistake";
  if (pathname.startsWith("/premortem")) return "What Could Go Wrong";
  if (pathname.startsWith("/my-week")) return "My week";
  if (pathname.startsWith("/plan")) return "This week's plan";
  if (pathname.startsWith("/exams")) return "Exams";
  if (pathname.startsWith("/room")) return "Study Room";
  /* Covers /friends/add/:code too, so an invite link keeps the sidebar's
     Friends item highlighted the way NavLink's own prefix match already
     does — the landing page has no nav entry of its own. */
  if (pathname.startsWith("/friends")) return "Friends";
  if (pathname.startsWith("/settings")) return t("nav_settings");
  return "Learnora";
}

/* Routes whose view renders its own page-level hero (eyebrow + title +
 * description, sometimes an action). On those, the shell's Header must not
 * also render a title, or the page prints its own name twice — which is
 * exactly what shipped: `/notebooks` rendered the word "Notebooks" as the
 * shell <h1> and again 150px below as the hub <h1>, and four more routes
 * printed a shell title above a longer restatement of the same thing
 * ("Explain It Simply" over the hub's own longer hero title, "Study Room" over
 * "Virtual Study Circle", and so on).
 *
 * Two <h1>s per document is also an accessibility defect independent of how
 * it looks. The rule here is that a page has exactly one title: either the
 * shell supplies it (the common case, for views that are just content) or
 * the view does (these five, whose heroes carry more than a name). */
const HERO_ROUTES = [
  "/notebooks",
  "/feynman",
  "/premortem",
  "/debugger",
  "/room",
];

export function viewOwnsPageTitle(pathname: string): boolean {
  return HERO_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}
