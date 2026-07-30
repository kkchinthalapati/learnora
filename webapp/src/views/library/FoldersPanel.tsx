import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { formatCreatedLong, safeColor } from "./libraryMeta";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

/* The Library's Folders tab — ports js/router.js:334-385.
 *
 * The material count per folder comes from the same `useMaterials()` query the
 * Materials tab reads, so switching tabs doesn't refetch the list a second
 * time; the vanilla issued its own `Materials.fetch()` here on every render of
 * the tab.
 *
 * Card structure differs from the vanilla for one reason: there, the whole
 * card was a `[data-hash]` div with the rename/delete buttons nested *inside*
 * it, so a click on Delete also navigated into the folder — which the router
 * had to defuse by checking `[data-action]` first and returning early
 * (js/router.js:32-44). Here the card is a real <Link> and the two buttons are
 * siblings layered above it, so neither can trigger the other and the whole
 * ordering hack disappears. */
export function FoldersPanel() {
  const { data: folders, isPending, isError, error } = useFolders();
  const { data: materials } = useMaterials();
  const { rename, removeFolder } = useLibraryActions();
  const { openCreateModal } = useCreateModal();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of materials ?? []) {
      if (!m.folder_id) continue;
      map.set(m.folder_id, (map.get(m.folder_id) ?? 0) + 1);
    }
    return map;
  }, [materials]);

  const newFolder = () => openCreateModal({ type: "subject" });

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label="Loading your folders" height={180} />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your folders. {(error as Error).message}
      </p>
    );
  }

  if (folders.length === 0) {
    return (
      <EmptyState
        icon="folder"
        title="No folders yet."
        message="1. Create a folder for a course or subject → 2. Add a PDF, link, or notes to it → 3. Learnora AI builds notes, flashcards, and quizzes for you."
      >
        <Button variant="primary" onClick={newFolder}>
          + Create Folder
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className={styles.grid}>
      {folders.map((folder) => {
        const count = counts.get(folder.id) ?? 0;
        const created = formatCreatedLong(folder.created_at);
        return (
          <li
            key={folder.id}
            className={styles.card}
            style={{ borderTop: `4px solid ${safeColor(folder.color)}` }}
          >
            <Link to={`/folders/${folder.id}`} className={styles.cardLink}>
              <h3 className={styles.cardTitle}>
                <Icon name="folder" size={18} />
                {folder.name}
              </h3>
              <p className={styles.cardMeta}>
                {count} material{count === 1 ? "" : "s"}
                {created ? ` • Created ${created}` : ""}
              </p>
            </Link>

            <div className={styles.cardActions}>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Rename ${folder.name}`}
                title="Rename folder"
                onClick={() => void rename(folder.id, folder.name)}
              >
                <Icon name="pencil" size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Delete ${folder.name}`}
                title="Delete folder"
                onClick={() => void removeFolder(folder.id, folder.name)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
        );
      })}

      <li className={styles.newCard}>
        <button type="button" className={styles.newCardBtn} onClick={newFolder}>
          + New Folder
        </button>
      </li>
    </ul>
  );
}
