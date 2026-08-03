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
 * The AI study sidebar that shares the row with the editor arrived later, as
 * Step 25 — it needed the AI layer (Step 14) and the chat surface Step 17
 * built, and the ledger's dependency table has 17 depend on 13, not the
 * reverse. It is `NotesAiSidebar`, mounted by `NotesEditorPane`. */
export function NotesView() {
  const { materialId = "" } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const material = useMaterial(materialId);
  const notes = useNotesByMaterial(materialId);

  if (material.isPending || notes.isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading your notes" height={400} />
      </div>
    );
  }

  if (material.isError || notes.isError) {
    return (
      <div className={styles.view}>
        <p role="alert" className={styles.loadError}>
          Could not load these notes.{" "}
          {((material.error ?? notes.error) as Error).message}
        </p>
      </div>
    );
  }

  if (!material.data) {
    return (
      <div className={styles.view}>
        <EmptyState
          icon="file-text"
          title="This file no longer exists."
          message="It may have been deleted from another tab or device."
        >
          <Button variant="primary" onClick={() => void navigate("/library")}>
            Back to Library
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <NotesEditorPane
      key={materialId}
      materialId={materialId}
      materialTitle={material.data.title}
      folderId={material.data.folder_id ?? null}
      note={notes.data[0] ?? null}
    />
  );
}
