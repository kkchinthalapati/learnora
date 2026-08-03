import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { useCreateModal } from "../../context/createModal";
import { FoldersPanel } from "./FoldersPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { QuizzesPanel } from "./QuizzesPanel";
import {
  LIBRARY_TABS,
  isLibraryTab,
  pathForTab,
  type LibraryTabId,
} from "./libraryMeta";
import styles from "./library.module.css";

/* The Library shell — ports index.html:1684-1716 + js/router.js:251-268.
 *
 * The active tab lives in the URL, as it did in the vanilla (`#library`,
 * `#library-materials`, …), so every tab stays linkable and survives a
 * refresh: `/library` is Folders and `/library/<tab>` is the rest. An unknown
 * tab redirects to `/library` rather than silently rendering Folders under a
 * URL that says otherwise — the vanilla's `known.includes(tab) ? tab :
 * "folders"` left the address bar lying.
 *
 * Only the selected panel is mounted, which is also what makes the vanilla's
 * "load only this tab's data" behaviour fall out for free: an unmounted
 * panel's queries never run.
 *
 * The tab strip was already a real ARIA tablist in the vanilla markup
 * (role="tab"/aria-selected/aria-controls were all present); what it lacked
 * was keyboard support — all four tabs sat in the tab order and arrow keys did
 * nothing. Roving tabIndex plus Arrow/Home/End is added here, matching the
 * Settings port. */

const PANELS: Record<LibraryTabId, () => React.ReactElement> = {
  folders: FoldersPanel,
  materials: MaterialsPanel,
  flashcards: FlashcardsPanel,
  quizzes: QuizzesPanel,
};

export function LibraryView() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (tab !== undefined && !isLibraryTab(tab)) {
    return <Navigate to="/library" replace />;
  }
  const active: LibraryTabId = tab ?? "folders";

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = LIBRARY_TABS.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (index + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (index - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    const id = LIBRARY_TABS[next].id;
    void navigate(pathForTab(id));
    tabRefs.current[id]?.focus();
  }

  const Panel = PANELS[active];

  return (
    <main className={styles.view}>
      {/* The app shell's Header supplies the page's real <h1> ("Library",
          identical to this row's own title text) — this row's own title is
          plain text, not a second heading, so it doesn't duplicate that.
          See redesign/DESIGN_MOVES.md move #2. */}
      <PageHeader
        title="Library"
        sub="Your folders, materials, decks, and quizzes — all in one place."
        actions={
          <Button variant="primary" onClick={() => openCreateModal()}>
            + Create
          </Button>
        }
      />

      <div role="tablist" aria-label="Library sections" className={styles.tabs}>
        {LIBRARY_TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`library-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`library-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            className={`${styles.tab}${active === t.id ? ` ${styles.tabActive}` : ""}`}
            onClick={() => void navigate(pathForTab(t.id))}
            onKeyDown={(e) => onTabKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`library-panel-${active}`}
        aria-labelledby={`library-tab-${active}`}
        tabIndex={0}
        className={styles.panel}
      >
        <Panel />
      </div>
    </main>
  );
}
