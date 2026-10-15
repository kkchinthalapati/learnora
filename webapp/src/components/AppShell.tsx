import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { OfflineBanner, OfflinePageNotice } from "./OfflineBanner";
import { TopBar } from "./TopBar";
import { useBlockReminders } from "../hooks/useBlockReminders";
import { useOfflineReviewSync } from "../hooks/useOfflineReview";
import { keepUrlInWorkerScope } from "../lib/serviceWorker";
import styles from "./AppShell.module.css";

/* The signed-in frame: the top bar, then the page (DESIGN.md rule 0.2). The
 * sidebar, its tablet rail and its phone drawer are gone; on phones the top
 * bar's three destinations move to a bottom bar it renders itself. */
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

      <main className={styles.mainContent}>
        <TopBar />
        <div className={styles.contentFrame}>
          <Header />
          <div id="page-content" tabIndex={-1}>
            <OfflinePageNotice />
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
