import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { useCreateModal } from "../../context/createModal";
import { FoldersPanel } from "./FoldersPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { QuizzesPanel } from "./QuizzesPanel";
import { LibrarySearch } from "./LibrarySearch";
import { NotebooksHubView } from "../notebooks/NotebooksHubView";
import {
  LIBRARY_SECTIONS,
  LIBRARY_TABS,
  MATERIAL_KINDS,
  isLibraryTab,
  pathForTab,
  sectionOf,
  type LibraryTabId,
} from "./libraryMeta";
import styles from "./library.module.css";

const PANELS: Record<LibraryTabId, () => React.ReactElement> = {
  notebooks: () => <NotebooksHubView embedded />,
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
  const [isSearching, setIsSearching] = useState(false);

  if (tab !== undefined && !isLibraryTab(tab)) {
    return <Navigate to="/library" replace />;
  }
  const active: LibraryTabId = tab ?? "folders";
  const section = sectionOf(active);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = LIBRARY_SECTIONS.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (index + 1) % count;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (index - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    const target = LIBRARY_SECTIONS[next];
    void navigate(pathForTab(target.tab));
    tabRefs.current[target.id]?.focus();
  }

  const Panel = PANELS[active];

  return (
    <div className={styles.view}>
      <header className={styles.lead}>
        <span className={styles.eyebrow}>Your study workspace</span>
        <h1>Your learning</h1>
        <p>Everything you study from, sorted by subject.</p>
      </header>
      <LibrarySearch
        onActiveChange={setIsSearching}
        action={
          <Button variant="primary" onClick={() => openCreateModal()}>
            Add your notes
          </Button>
        }
      />

      {!isSearching ? (
        <>
          <div
            role="tablist"
            aria-label="Library sections"
            className={styles.tabs}
          >
            {LIBRARY_SECTIONS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`library-tab-${t.id}`}
                aria-selected={section === t.id}
                aria-controls={`library-panel-${t.id}`}
                tabIndex={section === t.id ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                className={`${styles.tab}${section === t.id ? ` ${styles.tabActive}` : ""}`}
                onClick={() => void navigate(pathForTab(t.tab))}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`library-panel-${section}`}
            aria-labelledby={`library-tab-${section}`}
            tabIndex={0}
            className={styles.panel}
          >
            {section === "material" ? (
              <nav className={styles.kinds} aria-label="Kind of material">
                {MATERIAL_KINDS.map((k) => (
                  <Link
                    key={k.id}
                    to={pathForTab(k.id)}
                    className={styles.kind}
                    aria-current={active === k.id ? "page" : undefined}
                  >
                    {active === k.id ? <span aria-hidden="true">✓ </span> : null}
                    {k.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            <p className={styles.tabBlurb}>
              {LIBRARY_TABS.find((t) => t.id === active)?.blurb}
            </p>
            <Panel />
          </div>
        </>
      ) : null}
    </div>
  );
}
