import { Suspense, lazy, useState } from "react";
import { Button } from "../../components/Button";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { useSettings } from "../../context/settings";
import { generateStudyGuide } from "../../api/aiStudyGuide";
import { guideLibrary } from "../../lib/openui/library";
import { fingerprint, loadGuide, saveGuide } from "../../lib/openui/guideCache";
import styles from "./notesGuide.module.css";

const OpenUiBlock = lazy(() => import("../../components/chat/OpenUiBlock"));

/* A read-only study guide drawn from the note's text, as OpenUI cards.
 *
 * The note itself is never changed. The guide is cached in this browser
 * against a fingerprint of the note, so reopening is free and an edited note
 * is flagged as "out of date" rather than silently described by old cards. */
export function NotesStudyGuide({
  materialId,
  title,
  getNoteText,
  onClose,
}: {
  materialId: string;
  title: string;
  getNoteText: () => string;
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const [stored, setStored] = useState(() => loadGuide(materialId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stale =
    stored !== null && stored.fingerprint !== fingerprint(getNoteText());

  const build = async () => {
    const text = getNoteText();
    setBusy(true);
    setError(null);
    try {
      const code = await generateStudyGuide({ title, noteText: text, settings });
      saveGuide(materialId, text, code);
      setStored(loadGuide(materialId));
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The AI service is busy.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.guide} aria-label="Study guide" aria-busy={busy}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Study guide</h2>
          <p className={styles.sub}>
            Made by the tutor from this note. Your note isn’t changed, and
            nothing here is saved to your progress, so check it against the
            note.
          </p>
        </div>
        <div className={styles.actions}>
          <Button size="sm" onClick={() => void build()} disabled={busy}>
            {busy ? "Building…" : stored ? "Rebuild" : "Build guide"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {stale && !busy ? (
        <p className={styles.stale} role="status">
          You’ve edited this note since the guide was built. Rebuild to bring it
          up to date.
        </p>
      ) : null}

      {error ? (
        <AiErrorCard
          detail={error}
          onRetry={() => void build()}
          kept="Your note is untouched."
        />
      ) : null}

      {stored ? (
        <Suspense fallback={null}>
          <OpenUiBlock key={stored.at} code={stored.code} library={guideLibrary} />
        </Suspense>
      ) : !busy && !error ? (
        <p className={styles.empty}>
          Build a guide of key terms, ideas, flashcards and a short check from
          this note.
        </p>
      ) : null}
    </section>
  );
}
