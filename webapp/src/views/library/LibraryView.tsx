import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { Tabs, TabPanel, useTabIds } from "../../components/Tabs";
import { useCreateModal } from "../../context/createModal";
import { FoldersPanel } from "./FoldersPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { QuizzesPanel } from "./QuizzesPanel";
import { LibrarySearch } from "./LibrarySearch";
import { NotebooksHubView } from "../notebooks/NotebooksHubView";
import {
  LIBRARY_TABS,
  isLibraryTab,
  pathForTab,
  type LibraryTabId,
} from "./libraryMeta";
import styles from "./library.module.css";

/* The Library (webapp/DESIGN.md 0.3-0.4): everything you've saved, from
 * every subject, in one list per kind. Reached from Subjects; the same page
 * header and tab strip as every other page with parts. */

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
  const [isSearching, setIsSearching] = useState(false);
  const idBase = useTabIds();

  if (tab !== undefined && !isLibraryTab(tab)) {
    return <Navigate to="/library" replace />;
  }
  const active: LibraryTabId = tab ?? "folders";
  const Panel = PANELS[active];

  return (
    <div className={styles.view}>
      <PageHeader
        as="h1"
        title="Library"
        sub="Everything you've saved, from every subject."
        actions={
          <Button variant="primary" onClick={() => openCreateModal()}>
            Add a lesson
          </Button>
        }
      />
      <LibrarySearch onActiveChange={setIsSearching} />

      {!isSearching ? (
        <>
          <Tabs
            items={LIBRARY_TABS.map((t) => ({ value: t.id, label: t.label }))}
            value={active}
            onChange={(next) => void navigate(pathForTab(next))}
            label="Library sections"
            idBase={idBase}
          />
          <TabPanel idBase={idBase} value={active}>
            <p className={styles.tabBlurb}>
              {LIBRARY_TABS.find((t) => t.id === active)?.blurb}
            </p>
            <Panel />
          </TabPanel>
        </>
      ) : null}
    </div>
  );
}
