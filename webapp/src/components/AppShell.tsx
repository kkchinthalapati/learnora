import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

const MOBILE_BREAKPOINT = 768;

function checkIsMobile(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
}

export function AppShell() {
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
