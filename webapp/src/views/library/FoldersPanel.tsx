import { useMemo } from "react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { ListRow, ListRows } from "../../components/ListRow";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useNotebooks } from "../../hooks/useNotebooks";
import { safeColor } from "./libraryMeta";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

export function FoldersPanel() {
  const { data: folders, isPending, isError, error } = useFolders();
  const { data: materials } = useMaterials();
  const { notebooks } = useNotebooks();
  const { rename, removeFolder } = useLibraryActions();
  const { openCreateModal } = useCreateModal();

  const notebookCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const nb of notebooks ?? []) {
      if (!nb.folderId) continue;
      counts.set(nb.folderId, (counts.get(nb.folderId) ?? 0) + 1);
    }
    return counts;
  }, [notebooks]);

  const materialCountByFolder = useMemo(() => {
    const folderCounts = new Map<string, number>();
    for (const material of materials ?? []) {
      if (!material.folder_id) continue;
      folderCounts.set(
        material.folder_id,
        (folderCounts.get(material.folder_id) ?? 0) + 1,
      );
    }
    return folderCounts;
  }, [materials]);

  const newFolder = () => openCreateModal({ type: "subject" });

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label="Loading your subjects" height={180} />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your subjects. {(error as Error).message}
      </p>
    );
  }

  if (folders.length === 0) {
    return (
      <EmptyState
        icon="upload-cloud"
        title="Your notes become lessons, quizzes and cards."
        message="Add notes, slides or a worksheet, or just name a topic. Only you can see them, and you can delete them at any time."
      >
        {/* Secondary: the Library header's "Add your notes" is the page's
            one primary action. */}
        <Button
          variant="secondary"
          onClick={() => openCreateModal({ type: "material" })}
        >
          Add lesson
        </Button>
        <Button variant="ghost" onClick={newFolder}>
          New subject
        </Button>
      </EmptyState>
    );
  }

  /* The same rows as the Subjects page (webapp/DESIGN.md 0.4): a row links to
     the subject; rename and delete sit beside it, outside the link. */
  return (
    <div className={styles.folderList}>
      <ListRows label="Subjects">
        {folders.map((folder) => {
          const count = materialCountByFolder.get(folder.id) ?? 0;
          const notebookCount = notebookCountByFolder.get(folder.id) ?? 0;
          return (
            <ListRow
              key={folder.id}
              icon="layers"
              tint={safeColor(folder.color)}
              title={folder.name}
              meta={[
                `${count} ${count === 1 ? "lesson" : "lessons"}`,
                notebookCount > 0 ? `${notebookCount} ${notebookCount === 1 ? "notebook" : "notebooks"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              to={`/subjects/${encodeURIComponent(folder.id)}`}
              trailing={
                <>
                  <IconButton
                    variant="ghost"
                    aria-label={`Rename ${folder.name}`}
                    title="Rename subject"
                    onClick={() => void rename(folder.id, folder.name)}
                  >
                    <Icon name="pencil" size={16} />
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    aria-label={`Delete ${folder.name}`}
                    title="Delete subject"
                    onClick={() => void removeFolder(folder.id, folder.name)}
                  >
                    <Icon name="trash" size={16} />
                  </IconButton>
                </>
              }
            />
          );
        })}
      </ListRows>
      <Button variant="secondary" onClick={newFolder} className={styles.newSubject}>
        New subject
      </Button>
    </div>
  );
}
