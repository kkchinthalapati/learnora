/* document.title per route (WCAG 2.4.2). Every screen used to be titled
 * "Learnora", so a screen-reader user heard nothing on navigation and a
 * student with three tabs open could not tell them apart.
 *
 * Prefix match, first hit wins, so specific paths come before their parents.
 * Screens that know something better (a session's objective) set their own
 * title over this one with `useDocumentTitle`. */
import { useEffect } from "react";
import { useLocation } from "react-router";

const TITLES: ReadonlyArray<readonly [prefix: string, title: string]> = [
  ["/welcome-pro", "Welcome to Pro"],
  ["/welcome", "Welcome"],
  ["/login", "Log in"],
  ["/signup", "Create your account"],
  ["/forgot-password", "Reset your password"],
  ["/reset-password", "Choose a new password"],
  ["/verify", "Confirm your email"],
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/library/materials", "Files & notes · Library"],
  ["/library/flashcards", "Flashcards · Library"],
  ["/library/quizzes", "Quizzes · Library"],
  ["/library/notebooks", "Notebooks · Library"],
  ["/library", "Library"],
  ["/folders/", "Subject"],
  ["/notes/", "Notes"],
  ["/notebooks/", "Notebook"],
  ["/decks/", "Deck"],
  ["/review/", "Flashcard review"],
  ["/quiz/", "Quiz"],
  ["/study/", "Study session"],
  ["/study", "Study"],
  ["/plan", "Study plan · Plan"],
  ["/my-week", "Availability · Plan"],
  ["/tasks", "Tasks · Plan"],
  ["/exams", "Exams · Plan"],
  ["/timer", "Focus timer"],
  ["/analytics", "Progress"],
  ["/trajectory", "Trajectory · Progress"],
  ["/feynman/debrief", "Teach debrief"],
  ["/friends", "Friends"],
  ["/room", "Study room"],
  ["/settings", "Settings"],
];

export const APP_NAME = "Learnora";

export function titleForPath(pathname: string): string {
  if (pathname === "/" || pathname === "") return `Today · ${APP_NAME}`;
  const hit = TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return hit ? `${hit[1]} · ${APP_NAME}` : APP_NAME;
}

/** Set the document title while mounted. `null` leaves the route's title. */
export function useDocumentTitle(title: string | null | undefined): void {
  /* Re-applied on every path change too: the route-level title is set by an
     earlier sibling's effect, which would otherwise win after a navigation
     that leaves `title` unchanged (a new session getting its real id). */
  const { pathname } = useLocation();
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${APP_NAME}`;
  }, [title, pathname]);
}

/** Mounted once inside the router: the default title for whatever route is
 *  showing. */
export function RouteTitle(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
  return null;
}
