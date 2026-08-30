import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useMaterials } from "../../hooks/useMaterials";
import { useRetryStudyPackage } from "../../hooks/useStudyPackage";
import {
  deriveMaterialStatus,
  useAllMaterialProcessing,
} from "../../lib/materialProcessing";
import { formatCreatedShort } from "./libraryMeta";
import styles from "./library.module.css";
import { Badge } from "../../components/Badge";

export function MaterialsPanel() {
  const { data: materials, isPending, isError, error } = useMaterials();
  const { openCreateModal } = useCreateModal();
  const retryMutation = useRetryStudyPackage();
  const processingRecords = useAllMaterialProcessing();

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
        message="Add a PDF, link, pasted text, or topic, then choose which notes, flashcards, or quiz to create."
      >
        <Button
          variant="primary"
          onClick={() => openCreateModal({ type: "material" })}
        >
          Create study resources
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className={styles.grid}>
      {materials.map((material) => {
        const record = processingRecords[material.id];
        const derived = deriveMaterialStatus(material, 1, record);
        const isRetrying =
          retryMutation.isPending &&
          retryMutation.variables !== undefined &&
          (typeof retryMutation.variables === "string"
            ? retryMutation.variables === material.id
            : retryMutation.variables.materialId === material.id);

        const status = isRetrying ? "processing" : derived.status;

        return (
          <li key={material.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <Link
                to={`/notes/${material.id}`}
                className={styles.cardTitleLink}
              >
                <h3 className={styles.cardTitle}>
                  <Icon name="file-text" size={18} />
                  {material.title}
                </h3>
              </Link>
              {status === "processing" && (
                <Badge
                  tone="accent"
                  size="sm"
                  role="status"
                  aria-label="Processing"
                >
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>Processing...</span>
                </Badge>
              )}
              {status === "partially_processed" && (
                <Badge
                  tone="warning"
                  size="sm"
                  role="status"
                  aria-label="Partially processed"
                >
                  <Icon name="alert-triangle" size={13} />
                  <span>Partially processed</span>
                </Badge>
              )}
              {status === "failed" && (
                <Badge
                  tone="danger"
                  size="sm"
                  role="alert"
                  aria-label="Processing failed"
                >
                  <Icon name="alert-circle" size={13} />
                  <span>Processing failed</span>
                </Badge>
              )}
            </div>

            <p className={styles.cardMeta}>
              Added {formatCreatedShort(material.created_at)}
            </p>

            {status === "failed" && (
              <div className={styles.cardErrorBox} role="alert">
                <strong>Error:</strong>
                <span>
                  {derived.error || "Generation failed. Please retry."}
                </span>
                {derived.stageFailures && derived.stageFailures.length > 0 && (
                  <div>
                    {derived.stageFailures.map((f, i) => (
                      <div key={i}>
                        <em>{f.stage}:</em> {f.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {status === "partially_processed" && (
              <div className={styles.cardWarningBox} role="status">
                <strong>Some stages failed:</strong>
                <span>
                  {derived.error || "Some resources could not be generated."}
                </span>
                {derived.stageFailures && derived.stageFailures.length > 0 && (
                  <div>
                    {derived.stageFailures.map((f, i) => (
                      <div key={i}>
                        <em>{f.stage}:</em> {f.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.cardActionsRow}>
              <Link to={`/notes/${material.id}`} className={styles.cardCta}>
                Open notes
              </Link>
              {(status === "failed" || status === "partially_processed") && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isRetrying}
                  onClick={(e) => {
                    e.preventDefault();
                    retryMutation.mutate(material.id);
                  }}
                >
                  {isRetrying ? "Retrying..." : "Retry"}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
