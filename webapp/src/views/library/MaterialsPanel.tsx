import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useMaterials } from "../../hooks/useMaterials";
import { formatCreatedShort } from "./libraryMeta";
import styles from "./library.module.css";

/* The Library's Materials tab — ports js/router.js:273-298. Every uploaded
 * material across all folders, each a link into its notes. */
export function MaterialsPanel() {
  const { data: materials, isPending, isError, error } = useMaterials();
  const { openCreateModal } = useCreateModal();

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label="Loading your materials" height={180} />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your materials. {(error as Error).message}
      </p>
    );
  }

  if (materials.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="No materials yet."
        message="Add a file, some text, a link, or just a topic — Learnora AI turns it into notes you can study from."
      >
        <Button variant="primary" onClick={() => openCreateModal()}>
          + Create
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className={styles.grid}>
      {materials.map((material) => (
        <li key={material.id} className={styles.card}>
          <Link to={`/notes/${material.id}`} className={styles.cardLink}>
            <h3 className={styles.cardTitle}>
              <Icon name="file-text" size={18} />
              {material.title}
            </h3>
            <p className={styles.cardMeta}>
              Added {formatCreatedShort(material.created_at)}
            </p>
            {/* Not a control: the card itself is the link, and a nested
                interactive element inside an <a> is invalid. The vanilla
                styled a bare <span> the same way, for the same reason. */}
            <span className={styles.cardCta}>Open notes</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
