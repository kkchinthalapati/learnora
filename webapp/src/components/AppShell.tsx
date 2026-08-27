import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import styles from "./AppShell.module.css";

const MOBILE_BREAKPOINT = 768;

function checkIsMobile(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
}

/* The persistent chrome around every signed-in route — ports the
 * `#main-app`/`.app-container` shell (index.html:328-337, 413-445): the
 * sidebar, the header, and the decorative background blobs.
 * Mounted as its own layout route nested inside `ProtectedRoute` (see routes.tsx).
 *
 * Responsive Sidebar Architecture & State Decoupling:
 * We explicitly separate two independent UI concepts:
 * 1. `mobileOpen` (boolean): Controls whether the mobile off-canvas drawer is
 *    slid into view (open) or hidden off-screen (closed).
 * 2. `desktopCollapsed` (boolean): Controls whether the desktop sidebar is
 *    retracted to an icon-only rail (collapsed) or full-width (expanded).
 *
 * In `Sidebar.module.css`, the `.sidebar.collapsed` selector is breakpoint-dependent:
 * - Desktop (@media min-width: 769px): `.sidebar.collapsed` shrinks width to 76px.
 * - Mobile (@media max-width: 768px): `.sidebar` is off-canvas (left: -100%), and
 *   `.sidebar.collapsed` brings it on-screen (left: 0).
 *
 * By evaluating `isSidebarCollapsed` as `mobileOpen` on mobile viewports and
 * `desktopCollapsed` on desktop viewports, mobile drawer toggles and desktop rail
 * toggles never contaminate or overwrite each other.
 */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => checkIsMobile());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(checkIsMobile());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* Header hamburger button handler:
   * - On mobile: toggles off-canvas drawer visibility.
   * - On desktop: toggles between full sidebar and icon-only rail.
   */
  const handleToggleMenu = () => {
    if (checkIsMobile()) {
      setMobileOpen((open) => !open);
    } else {
      setDesktopCollapsed((collapsed) => !collapsed);
    }
  };

  /* In-sidebar rail collapse toggle handler (desktop rail button). */
  const handleToggleDesktopCollapse = () => {
    setDesktopCollapsed((collapsed) => !collapsed);
  };

  /* Navigation handler:
   * Auto-closes the mobile drawer upon route/action navigation without
   * affecting desktop rail collapse preference.
   */
  const handleNavigate = () => {
    if (checkIsMobile()) {
      setMobileOpen(false);
    }
  };

  const isCurrentMobile = checkIsMobile() || isMobile;
  const isSidebarCollapsed = isCurrentMobile ? mobileOpen : desktopCollapsed;

  return (
    <div className={styles.appContainer}>
      <OfflineBanner />
      {/* First focusable element in the whole shell: a keyboard user
          otherwise has to tab through every sidebar link (and the Create
          button) on *every* page before reaching what the page actually
          says. Invisible until focused, so sighted mouse/touch users never
          see it. Targets the wrapper around `<Outlet />` below, not `<main>`
          itself — jumping to `<main>` would land before the page's own
          heading, past the Header but still not "the content". */}
      <a
        href="#page-content"
        className={styles.skipLink}
        onClick={() => document.getElementById("page-content")?.focus()}
      >
        Skip to content
      </a>



      <Sidebar
        collapsed={isSidebarCollapsed}
        onNavigate={handleNavigate}
        onToggleCollapse={handleToggleDesktopCollapse}
      />
      {isMobile && mobileOpen ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <main className={styles.mainContent}>
        <Header onToggleMenu={handleToggleMenu} />
        {/* tabIndex={-1}: not in the tab order on its own, just a valid
            focus target for the skip link — most browsers already move
            focus here from the `href="#page-content"` jump alone, but the
            skip link's own onClick calls .focus() explicitly rather than
            trusting that everywhere (Safari has a history of not doing it
            for a same-page fragment click). */}
        <div id="page-content" tabIndex={-1}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
