import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { OfflineBanner, OfflinePageNotice } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import { MobileTabBar } from "./MobileTabBar";
import { useBlockReminders } from "../hooks/useBlockReminders";
import { useOfflineReviewSync } from "../hooks/useOfflineReview";
import { keepUrlInWorkerScope } from "../lib/serviceWorker";
import styles from "./AppShell.module.css";

const MOBILE_BREAKPOINT = 768;

function checkIsMobile(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
}

export function AppShell() {
  /* Mounted on the shell, not the dashboard card that renders the same
     schedule: a reminder that only fires while the student happens to be
     looking at their dashboard is a reminder for the one case they did not
     need one. */
  useBlockReminders();
  /* Keeps due cards on the device and the review screen in the worker's
     cache, so flashcard review works with no connection. */
  useOfflineReviewSync();
  /* Home renders at /app, outside the worker's /app/ scope; see
     keepUrlInWorkerScope. Re-checked on every navigation back home. */
  const { pathname } = useLocation();
  useEffect(() => {
    keepUrlInWorkerScope();
  }, [pathname]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => checkIsMobile());

  useEffect(() => {
    const handleResize = () => setIsMobile(checkIsMobile());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleToggleMenu = () => {
    if (checkIsMobile()) {
      setMobileOpen((open) => !open);
      return;
    }
    setDesktopCollapsed((collapsed) => !collapsed);
  };

  const handleNavigate = () => {
    if (checkIsMobile()) setMobileOpen(false);
  };

  return (
    <div className={styles.appContainer}>
      <OfflineBanner />
      <a
        href="#page-content"
        className={styles.skipLink}
        onClick={() => document.getElementById("page-content")?.focus()}
      >
        Skip to content
      </a>

      <Sidebar
        railCollapsed={desktopCollapsed}
        drawerOpen={mobileOpen}
        onNavigate={handleNavigate}
        onToggleRail={() => setDesktopCollapsed((collapsed) => !collapsed)}
      />
      {isMobile && mobileOpen ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {isMobile ? <MobileTabBar onMore={() => setMobileOpen(true)} /> : null}

      <main className={styles.mainContent}>
        <div className={styles.contentFrame}>
          <Header onToggleMenu={handleToggleMenu} />
          <div id="page-content" tabIndex={-1}>
            <OfflinePageNotice />
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
