import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../../context/toast";
import { useFolders } from "../../hooks/useFolders";
import { useMoveMaterial } from "../../hooks/useMaterials";
import { useLibraryActions } from "../../views/library/useLibraryActions";
import type { Material } from "../../api/types";
import styles from "./lessonActions.module.css";

type LessonRef = Pick<Material, "id" | "title" | "folder_id" | "storage_path">;

/** Rename, file under a subject, or delete one lesson. The same three
 *  actions on the lesson page and in Library ▸ Lessons, so a lesson made
 *  from Home's topic box (which has no subject) can always be filed later. */
export function LessonActions({
  lesson,
  onDeleted,
  className,
}: {
  lesson: LessonRef;
  /** Called once the lesson is gone, e.g. to leave its page. */
  onDeleted?: () => void;
  className?: string;
}) {
  const { renameMaterial, removeMaterial } = useLibraryActions();
  const [moving, setMoving] = useState(false);

  return (
    <div className={`${styles.row} ${className ?? ""}`}>
      <button
        type="button"
        className={styles.action}
        onClick={() => setMoving(true)}
      >
        {lesson.folder_id ? "Move to another subject" : "Put in a subject"}
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={() => void renameMaterial(lesson.id, lesson.title)}
      >
        Rename
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.danger}`}
        onClick={() =>
          void removeMaterial(
            lesson.id,
            lesson.title,
            lesson.storage_path,
          ).then((gone) => {
            if (gone) onDeleted?.();
          })
        }
      >
        Delete lesson
      </button>
      {moving ? (
        <MoveLessonDialog lesson={lesson} onClose={() => setMoving(false)} />
      ) : null}
    </div>
  );
}

/** Opens straight into the subject picker; exported for the Mistakes tab's
 *  "Put this lesson in a subject" button. */
export function PutInSubjectButton({ lesson }: { lesson: LessonRef }) {
  const [moving, setMoving] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setMoving(true)}>
        Put this lesson in a subject
      </Button>
      {moving ? (
        <MoveLessonDialog lesson={lesson} onClose={() => setMoving(false)} />
      ) : null}
    </>
  );
}

const NONE = "";

function MoveLessonDialog({
  lesson,
  onClose,
}: {
  lesson: LessonRef;
  onClose: () => void;
}) {
  const folders = useFolders();
  const move = useMoveMaterial();
  const { showToast } = useToast();
  const selectId = useId();
  const [choice, setChoice] = useState<string>(lesson.folder_id ?? NONE);
  const [error, setError] = useState<string | null>(null);
  const subjects = folders.data ?? [];
  const unchanged = choice === (lesson.folder_id ?? NONE);

  const save = async () => {
    if (unchanged || move.isPending) return;
    setError(null);
    const folderId = choice === NONE ? null : choice;
    try {
      await move.mutateAsync({ id: lesson.id, folderId });
      const name = subjects.find((f) => f.id === folderId)?.name;
      showToast(name ? `Moved to ${name}.` : "Taken out of its subject.");
      onClose();
    } catch {
      setError("Couldn't move this lesson. Please try again.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Put in a subject"
      subtitle={`“${lesson.title}”, with its notes and quizzes.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={unchanged || subjects.length === 0}
            busy={move.isPending}
            onClick={() => void save()}
          >
            Move
          </Button>
        </>
      }
    >
      {folders.isPending ? (
        <p className={styles.hint}>Loading your subjects…</p>
      ) : subjects.length === 0 ? (
        <p className={styles.hint}>
          You have no subjects yet. <Link to="/subjects">Make one</Link>, then
          come back to file this lesson.
        </p>
      ) : (
        <div>
          <label htmlFor={selectId} className={styles.label}>
            Subject
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            autoFocus
          >
            <option value={NONE}>No subject</option>
            {subjects.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <p className={styles.hint}>
            Its quizzes and card sets go with it, and its mistakes show
            under the subject from now on. Card sets made before lessons
            kept track of them stay where they are.
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
