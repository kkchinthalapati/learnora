import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useMaterial } from "../../hooks/useMaterials";
import { useNotesByMaterial } from "../../hooks/useNotes";
import { NotesEditorPane } from "./NotesEditorPane";
import styles from "./notes.module.css";

/* Route-level wrapper for `/notes/:materialId` — resolves the material and
 * its notes (js/router.js:500-537's `loadNotes`), then hands off to
 * `NotesEditorPane` for the actual editing surface. Split the same way
 * Library's SubjectDetailPage/panels are: loading/error/not-found belongs to
 * the route, not the document editor.
 *
 * The vanilla's AI study sidebar (index.html:1804-1869 — quiz-me/flashcards
 * quick actions, the document-aware chat) is deliberately not ported here.
 * It depends on the AI layer (ledger step 14) and the chat surface Step 17
 * builds for real — the ledger's own dependency table has 17 depend on 13,
 * not the reverse, so this step is only ever the Quill pane. */
export function NotesView() {
  const { materialId = "" } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const material = useMaterial(materialId);
  const notes = useNotesByMaterial(materialId);

  if (material.isPending || notes.isPending) {
    return (
      <main className={styles.view} aria-busy="true">
        <Skeleton label="Loading your notes" height={400} />
      </main>
    );
  }

  if (material.isError || notes.isError) {
    return (
      <main className={styles.view}>
        <p role="alert" className={styles.loadError}>
          Could not load these notes.{" "}
          {((material.error ?? notes.error) as Error).message}
        </p>
      </main>
    );
  }

  if (!material.data) {
    return (
      <main className={styles.view}>
        <EmptyState
          icon="file-text"
          title="This file no longer exists."
          message="It may have been deleted from another tab or device."
        >
          <Button variant="primary" onClick={() => void navigate("/library")}>
            Back to Library
          </Button>
        </EmptyState>
      </main>
    );
  }

  return (
    <NotesEditorPane
      key={materialId}
      materialTitle={material.data.title}
      note={notes.data[0] ?? null}
    />
  );
}
