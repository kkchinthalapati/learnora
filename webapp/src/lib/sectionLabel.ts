/* Which top-level "section" a route belongs to, and its label — shared by
 * `Sidebar` (which item gets `.active`) and `Header` (what to show as the
 * current section). One function each, not duplicated per component.
 *
 * The vanilla derived the header's `#page-title` from whichever sidebar
 * link's text matched the current hash (`js/router.js:130-145`,
 * `js/ui.js:689-696`) — subject/notes/quiz/review pages have no sidebar
 * entry of their own, so the vanilla's title (and this one) stays "Library"
 * on all of them, same as it does on `/library` itself. */

export function isLibrarySection(pathname: string): boolean {
  return (
    pathname.startsWith("/library") ||
    pathname.startsWith("/folders/") ||
    pathname.startsWith("/notes/") ||
    pathname.startsWith("/quiz/") ||
    pathname.startsWith("/review/")
  );
}

export function sectionLabel(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (isLibrarySection(pathname)) return "Library";
  if (pathname.startsWith("/timer")) return "Timer";
  if (pathname.startsWith("/tasks")) return "Task Manager";
  if (pathname.startsWith("/plan")) return "This week's plan";
  if (pathname.startsWith("/exams")) return "Exams";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Learnora";
}
