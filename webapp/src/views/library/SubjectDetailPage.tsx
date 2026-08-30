import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useOptionalTimer } from "../../context/timer";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import { useAllDueFlashcards } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useQuizzes } from "../../hooks/useQuizzes";
import { useRetryStudyPackage } from "../../hooks/useStudyPackage";
import {
  deriveMaterialStatus,
  useAllMaterialProcessing,
} from "../../lib/materialProcessing";
import type { MaterialType } from "../../api/types";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";
import { Badge } from "../../components/Badge";

const MATERIAL_ICONS: Record<MaterialType, IconName> = {
  pdf: "file-text",
  youtube: "play",
  audio: "mic",
  text: "list-checks",
};

function Section({
  title,
  icon,
  hint,
  count,
  wide = false,
  children,
}: {
  title: string;
  icon: IconName;
  hint: string;
  count?: number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      as="section"
      variant="panel"
      padding="md"
      className={wide ? styles.workspaceSectionWide : undefined}
    >
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>
            <Icon name={icon} size={18} />
            {title}
          </h2>
          <p className={styles.sectionHint}>{hint}</p>
        </div>
        {count !== undefined ? (
          <span
            className={styles.sectionCount}
            aria-label={`${title}: ${count}`}
          >
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function SubjectDetailPage() {
  const { folderId = "" } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const timer = useOptionalTimer();
  const { showToast } = useToast();
  const { removeMaterial, removeDeck, removeQuiz } = useLibraryActions();

  const folders = useFolders();
  const materials = useMaterials(folderId);
  const decks = useAllDecks();
  const quizzes = useQuizzes();
  const allDueCards = useAllDueFlashcards(100);
  const retryMutation = useRetryStudyPackage();
  const processingRecords = useAllMaterialProcessing();

  const folder = folders.data?.find((f) => f.id === folderId);
  const folderDecks = useMemo(
    () => (decks.data ?? []).filter((d) => d.folder_id === folderId),
    [decks.data, folderId],
  );
  const folderQuizzes = useMemo(
    () => (quizzes.data ?? []).filter((q) => q.folder_id === folderId),
    [quizzes.data, folderId],
  );

  const dueInFolder = useMemo(() => {
    if (!allDueCards.data || !folderDecks.length) return [];
    const folderDeckIds = new Set(folderDecks.map((d) => d.id));
    return allDueCards.data.filter((c) =>
      Boolean(c.deck_id && folderDeckIds.has(c.deck_id)),
    );
  }, [allDueCards.data, folderDecks]);

  const targetDueDeckId = dueInFolder[0]?.deck_id ?? folderDecks[0]?.id;

  const handleStartFocus = () => {
    if (!folder) return;
    timer?.prepareFocus(25, folder.name, folder.id);
    showToast(`25-minute focus session ready for ${folder.name}.`);
    void navigate("/timer");
  };

  const handleLaunchFeynman = () => {
    if (!folder) return;
    CognitiveBridge.setPayload({
      subject: folder.name,
      topic: folder.name,
      sourceTool: "notes",
      suggestedAction: "teach_apprentice",
    });
    void navigate("/feynman");
  };

  const handleLaunchDebugger = () => {
    if (!folder) return;
    CognitiveBridge.setPayload({
      subject: folder.name,
      topic: folder.name,
      sourceTool: "notes",
      suggestedAction: "debug_stack",
    });
    void navigate("/debugger");
  };

  const handleLaunchPreMortem = () => {
    if (!folder) return;
    CognitiveBridge.setPayload({
      subject: folder.name,
      topic: folder.name,
      sourceTool: "notes",
      suggestedAction: "run_premortem",
    });
    void navigate("/premortem");
  };

  if (folders.isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading this subject" height={240} />
      </div>
    );
  }

  if (folders.isError) {
    return (
      <div className={styles.view}>
        <Link to="/library" className={styles.backLink}>
          ← Back to Library
        </Link>
        <p role="alert" className={styles.workspaceLoadError}>
          Could not load this subject. Check your connection and try again.
        </p>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className={styles.view}>
        <div className={styles.workspaceHeader}>
          <Link to="/library" className={styles.backLink}>
            ← Back to Library
          </Link>
        </div>
        <EmptyState
          icon="folder"
          title="This folder no longer exists."
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
    <div className={styles.view}>
      <div className={styles.workspaceHeader}>
        <div className={styles.workspaceIdentity}>
          <Link to="/library" className={styles.backLink}>
            ← Back to Library
          </Link>
          <p className={styles.workspaceEyebrow}>Subject workspace</p>
          <h2 className={styles.workspaceTitle}>{folder.name}</h2>
        </div>
        <div className={styles.workspaceActions}>
          {dueInFolder.length > 0 && targetDueDeckId ? (
            <Button
              variant="primary"
              onClick={() => void navigate(`/review/${targetDueDeckId}`)}
            >
              <Icon name="refresh-cw" size={16} />
              Review {dueInFolder.length} Due{" "}
              {dueInFolder.length === 1 ? "Card" : "Cards"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={handleStartFocus}>
            <Icon name="clock" size={16} />
            Focus on Subject (25m)
          </Button>
          <Button
            variant={dueInFolder.length > 0 ? "secondary" : "primary"}
            onClick={() => openCreateModal({ folderId, type: "material" })}
          >
            + Create
          </Button>
        </div>
      </div>

      <div className={styles.subjectAiBar} role="region" aria-label="AI Study Tools for this Subject">
        <span className={styles.subjectAiBarLabel}>
          <Icon name="brain" size={16} />
          <span>AI Study Suite for {folder.name}:</span>
        </span>
        <div className={styles.subjectAiActions}>
          <button
            type="button"
            className={styles.subjectAiBtn}
            onClick={handleLaunchFeynman}
            title="Test depth of understanding by teaching an AI apprentice"
          >
            <Icon name="award" size={13} />
            <span>Feynman Practice</span>
          </button>
          <button
            type="button"
            className={styles.subjectAiBtn}
            onClick={handleLaunchDebugger}
            title="Diagnose foundational misconception gaps"
          >
            <Icon name="zap" size={13} />
            <span>Root-Cause Debugger</span>
          </button>
          <button
            type="button"
            className={styles.subjectAiBtn}
            onClick={handleLaunchPreMortem}
            title="Simulate failure scenarios and surface blindspots before test day"
          >
            <Icon name="shield" size={13} />
            <span>Exam Pre-Mortem</span>
          </button>
        </div>
      </div>

      <div className={styles.workspaceGrid}>
        <Section
          title="Materials & Notes"
          icon="file-text"
          hint="Open a material to read and edit its notes."
          count={materials.data?.length}
          wide
        >
          {materials.isPending ? (
            <Skeleton label="Loading materials" height={80} />
          ) : materials.isError ? (
            <p role="alert" className={styles.loadError}>
              Could not load this folder&apos;s materials.
            </p>
          ) : materials.data.length === 0 ? (
            <EmptyState size="sm" message="No materials yet." />
          ) : (
            <ul className={styles.rowList}>
              {materials.data.map((material) => {
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
                  <li key={material.id} className={styles.row}>
                    <Link
                      to={`/notes/${material.id}`}
                      className={styles.rowLink}
                    >
                      <Icon
                        name={MATERIAL_ICONS[material.type] ?? "file-text"}
                        size={16}
                      />
                      <span className={styles.rowTitle}>{material.title}</span>
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
                    </Link>
                    {(status === "failed" ||
                      status === "partially_processed") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isRetrying}
                        onClick={() => retryMutation.mutate(material.id)}
                      >
                        {isRetrying ? "Retrying..." : "Retry"}
                      </Button>
                    )}
                    <button
                      type="button"
                      className={styles.rowDelete}
                      aria-label={`Delete ${material.title}`}
                      title="Delete this file"
                      onClick={() =>
                        void removeMaterial(
                          material.id,
                          material.title,
                          material.storage_path,
                        )
                      }
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Flashcard Decks"
          icon="layers"
          hint="Review decks created for this subject."
          count={decks.isPending ? undefined : folderDecks.length}
        >
          {decks.isPending ? (
            <Skeleton label="Loading decks" height={80} />
          ) : decks.isError ? (
            <p role="alert" className={styles.loadError}>
              Could not load this folder&apos;s decks.
            </p>
          ) : folderDecks.length === 0 ? (
            <EmptyState size="sm" message="No flashcard decks yet." />
          ) : (
            <ul className={styles.rowList}>
              {folderDecks.map((deck) => (
                <li key={deck.id} className={styles.row}>
                  <Link to={`/review/${deck.id}`} className={styles.rowLink}>
                    <Icon name="layers" size={15} />
                    <span className={styles.rowTitle}>{deck.title}</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.rowDelete}
                    aria-label={`Delete ${deck.title}`}
                    title="Delete this deck"
                    onClick={() => void removeDeck(deck.id, deck.title)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Quizzes"
          icon="help-circle"
          hint="Take or revisit quizzes for this subject."
          count={quizzes.isPending ? undefined : folderQuizzes.length}
        >
          {quizzes.isPending ? (
            <Skeleton label="Loading quizzes" height={80} />
          ) : quizzes.isError ? (
            <p role="alert" className={styles.loadError}>
              Could not load this folder&apos;s quizzes.
            </p>
          ) : folderQuizzes.length === 0 ? (
            <EmptyState size="sm" message="No quizzes yet." />
          ) : (
            <ul className={styles.rowList}>
              {folderQuizzes.map((quiz) => (
                <li key={quiz.id} className={styles.row}>
                  <Link to={`/quiz/${quiz.id}`} className={styles.rowLink}>
                    <Icon name="help-circle" size={15} />
                    <span className={styles.rowTitle}>{quiz.title}</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.rowDelete}
                    aria-label={`Delete ${quiz.title}`}
                    title="Delete this quiz"
                    onClick={() => void removeQuiz(quiz.id, quiz.title)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
