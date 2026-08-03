import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useAllDecks } from "../../hooks/useDecks";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useQuizzes } from "../../hooks/useQuizzes";
import type { MaterialType } from "../../api/types";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

/* One subject's workspace — ports index.html:1719-1748 + js/router.js:387-498.
 *
 * Three changes worth knowing about:
 *
 * 1. **The heading shows the subject's name.** The vanilla markup has
 *    `<h2 id="workspace-title">Workspace</h2>` and nothing in `js/` ever
 *    assigns to it, so every folder's workspace was titled "Workspace" — you
 *    could not tell from the page which one you had opened.
 * 2. **A folder id that doesn't resolve says so** instead of rendering three
 *    empty lists that look like a real but empty subject.
 * 3. Decks and quizzes are filtered out of the all-entities queries the
 *    Library tabs already load rather than issuing per-folder fetches. The
 *    vanilla did this for quizzes (`fetchAll().filter(...)`) but not decks;
 *    doing it for both means opening a subject from the Library costs no new
 *    requests, and a delete here updates the Library's tabs through the same
 *    cache entry. */

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
  children,
}: {
  title: string;
  icon: IconName;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" variant="elevated" padding="md">
      <h2 className={styles.sectionTitle}>
        <Icon name={icon} size={18} />
        {title}
      </h2>
      <p className={styles.sectionHint}>{hint}</p>
      {children}
    </Card>
  );
}

export function SubjectDetailPage() {
  const { folderId = "" } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const { openCreateModal } = useCreateModal();
  const { removeMaterial, removeDeck, removeQuiz } = useLibraryActions();

  const folders = useFolders();
  const materials = useMaterials(folderId);
  const decks = useAllDecks();
  const quizzes = useQuizzes();

  const folder = folders.data?.find((f) => f.id === folderId);
  const folderDecks = useMemo(
    () => (decks.data ?? []).filter((d) => d.folder_id === folderId),
    [decks.data, folderId],
  );
  const folderQuizzes = useMemo(
    () => (quizzes.data ?? []).filter((q) => q.folder_id === folderId),
    [quizzes.data, folderId],
  );

  if (folders.isPending) {
    return (
      <main className={styles.view} aria-busy="true">
        <Skeleton label="Loading this subject" height={240} />
      </main>
    );
  }

  if (!folder) {
    return (
      <main className={styles.view}>
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
          {/* navigate() rather than a <Link> wrapping the <Button>: a
              <button> inside an <a> is invalid HTML — interactive content
              cannot nest — and browsers disagree about which of the two gets
              the click. Same approach Step 13 used for this affordance. */}
          <Button variant="primary" onClick={() => void navigate("/library")}>
            Back to Library
          </Button>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className={styles.view}>
      <div className={styles.workspaceHeader}>
        <Link to="/library" className={styles.backLink}>
          ← Back to Library
        </Link>
        <h1 className={styles.workspaceTitle}>{folder.name}</h1>
        {/* The vanilla also pre-selected the folder's newest material here, to
            seed "generate a deck/quiz from this material". That flow is AI-
            driven and lands with the AI layer (ledger step 14); the folder
            pre-selection is the part that exists today. */}
        <Button
          variant="primary"
          onClick={() => openCreateModal({ folderId, type: "material" })}
        >
          + Create
        </Button>
      </div>

      <div className={styles.workspaceGrid}>
        <Section
          title="Materials & Notes"
          icon="file-text"
          hint="Click a file to read its AI-generated notes."
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
              {materials.data.map((material) => (
                <li key={material.id} className={styles.row}>
                  <Link to={`/notes/${material.id}`} className={styles.rowLink}>
                    <Icon
                      name={MATERIAL_ICONS[material.type] ?? "file-text"}
                      size={16}
                    />
                    <span className={styles.rowTitle}>{material.title}</span>
                  </Link>
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
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Flashcard Decks"
          icon="layers"
          hint="Use + Create above to build a deck from any material in this folder."
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
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Quizzes"
          icon="help-circle"
          hint="Use + Create above to build a quiz from a material here, or from any topic."
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
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
