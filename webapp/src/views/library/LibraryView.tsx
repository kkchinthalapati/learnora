import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { useCreateModal } from "../../context/createModal";
import { FoldersPanel } from "./FoldersPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { QuizzesPanel } from "./QuizzesPanel";
import { LibrarySearch } from "./LibrarySearch";
import {
  LIBRARY_TABS,
  isLibraryTab,
  pathForTab,
  type LibraryTabId,
} from "./libraryMeta";
import styles from "./library.module.css";

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
  const [isSearching, setIsSearching] = useState(false);

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
    <div className={styles.view}>
      <LibrarySearch
        onActiveChange={setIsSearching}
        action={
          <Button variant="primary" onClick={() => openCreateModal()}>
            + Create
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
        </>
      ) : null}
    </div>
  );
}
