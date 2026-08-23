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

export function sectionLabel(
  pathname: string,
  t: (key: TranslationKey) => string,
): string {
  if (pathname === "/") return t("nav_dashboard");
  if (isLibrarySection(pathname)) return t("nav_library");
  if (pathname.startsWith("/timer")) return t("nav_timer");
  if (pathname.startsWith("/tasks")) return t("nav_tasks");
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/graph")) return "Concept Graph";
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
