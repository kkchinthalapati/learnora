import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import styles from "./AppShell.module.css";

/* The persistent chrome around every signed-in route — ports the
 * `#main-app`/`.app-container` shell (index.html:328-337, 413-445): the
 * sidebar, the header, and the decorative background blobs, all of which
 * sat outside any one view in the vanilla and so had nothing to port them
 * onto until now. Mounted as its own layout route nested inside
 * `ProtectedRoute` (see routes.tsx) — `ProtectedRoute` only decides "is
 * there a session"; this decides "what wraps the view once there is one".
 *
 * `collapsed` is one boolean with a breakpoint-dependent meaning, exactly
 * like the vanilla's `.sidebar.collapsed` (js/main.js:727-738): on desktop
 * it hides the sidebar, on mobile it's the sidebar's *open* state (the
 * default there is off-canvas). See Sidebar.module.css for the two
 * media-query rules that give the one class its two meanings. */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  const closeOnMobile = () => {
    if (window.innerWidth <= 768) setCollapsed(false);
  };

  return (
    <div className={styles.appContainer}>
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

      {/* Plain global class names, not CSS-module ones: `data-bg-texture`
          disables these with a body-attribute selector in index.css, which
          can't target a module's hashed class name. Same reason the theme
          engine's other body-attribute-driven rules (index.css,
          themes.css) stay outside modules. */}
      <div className="liquid-blobs" aria-hidden="true">
        <div className="liquid-blob liquid-blob--1" />
        <div className="liquid-blob liquid-blob--2" />
        <div className="liquid-blob liquid-blob--3" />
      </div>

      <Sidebar collapsed={collapsed} onNavigate={closeOnMobile} />

      <main className={styles.mainContent}>
        <Header onToggleMenu={() => setCollapsed((c) => !c)} />
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
