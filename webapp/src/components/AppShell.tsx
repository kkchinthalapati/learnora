import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import { MobileTabBar } from "./MobileTabBar";
import { useBlockReminders } from "../hooks/useBlockReminders";
import styles from "./AppShell.module.css";

const MOBILE_BREAKPOINT = 768;
/* 768–1023px: the sidebar folds to its 72px rail by default so the page
   keeps its two columns. The student can still expand it. */
const RAIL_BREAKPOINT = 1023;

function checkIsMobile(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
}

function checkIsTablet(): boolean {
  return (
    typeof window !== "undefined" &&
    window.innerWidth > MOBILE_BREAKPOINT &&
    window.innerWidth <= RAIL_BREAKPOINT
  );
}

export function AppShell() {
  /* Mounted on the shell, not the dashboard card that renders the same
     schedule: a reminder that only fires while the student happens to be
     looking at their dashboard is a reminder for the one case they did not
     need one. */
  useBlockReminders();

  const [mobileOpen, setMobileOpen] = useState(false);
  /* null = follow the viewport (rail on tablets, full on desktop); a click
     on the collapse toggle pins the student's choice. */
  const [railPreference, setRailPreference] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(() => checkIsMobile());
  const [isTablet, setIsTablet] = useState(() => checkIsTablet());
  const desktopCollapsed = railPreference ?? isTablet;
  const toggleRail = () => setRailPreference(!desktopCollapsed);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(checkIsMobile());
      setIsTablet(checkIsTablet());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleToggleMenu = () => {
    if (checkIsMobile()) {
      setMobileOpen((open) => !open);
      return;
    }
    toggleRail();
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
        onToggleRail={toggleRail}
      />
      {isMobile && mobileOpen ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {isMobile ? <MobileTabBar /> : null}

      <main className={styles.mainContent}>
        <div className={styles.contentFrame}>
          <Header onToggleMenu={handleToggleMenu} />
          <div id="page-content" tabIndex={-1}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
