import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { QuickCheck, type QuickCheckResult } from "../../components/quickcheck/QuickCheck";
import { useOptionalAuth } from "../../context/auth";
import { useAllDecks } from "../../hooks/useDecks";
import { useFolders } from "../../hooks/useFolders";
import type { LocalSession } from "../../lib/localSessions";
import styles from "./today.module.css";

/** Placeholder task names the timer writes when the student attached
 *  nothing — they name no subject, so they cannot be quizzed on. */
const UNNAMED_TASKS = ["None", "General Study"];

export function SessionCompletePanel({ session, onClose }: { session: LocalSession; onClose: () => void }) {
  const signedIn = Boolean(useOptionalAuth()?.session);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<QuickCheckResult | null>(null);

  /* What the session was about, in descending order of how specific it is.
   *
   * This used to stop after the note, so a student who just pressed start
   * on the stopwatch — no task, no note, which is the quickest way to use
   * the timer and therefore a common one — finished to "choose a topic
   * next time" and no check at all. The retrieval check is the evidence
   * the misconception ledger leans on hardest, so giving up whenever the
   * student did not label their session wastes the most valuable moment
   * the app gets. The deck and the subject folder are already attached to
   * the session and name the material perfectly well. */
  const decks = useAllDecks();
  const folders = useFolders();
  const deckTitle = session.deckId
    ? decks.data?.find((deck) => deck.id === session.deckId)?.title
    : undefined;
  const folderName = session.folderId
    ? folders.data?.find((folder) => folder.id === session.folderId)?.name
    : undefined;

  const namedTask = UNNAMED_TASKS.includes(session.task) ? null : session.task;
  const topic =
    namedTask || session.notes?.trim() || deckTitle || folderName || null;
  return <section className={styles.region} aria-label="Session complete">
    {/* Name the material rather than the placeholder the timer stored. */}
    <h2 className={styles.regionTitle}>Session complete{topic ? `: ${topic}` : ""}</h2>
    {result ? <>
      <p role="status">{result.correct}/{result.total} correct. {result.change ? `${topic ?? session.task}: ${result.change}. ` : ""}{result.saved ? "Your next step is updated from this check." : "Your result is shown locally; account sync is pending."}</p>
      <Button onClick={onClose}>Done</Button>
    </> : checking && topic ? <QuickCheck key={session.id} topic={topic} deckId={session.deckId} folderId={session.folderId} clientId={`quick-check:${session.id}`} onDone={setResult} onSkip={onClose} /> : <>
      <p>{!signedIn ? "Create a free account to unlock AI session checks and quizzes." : topic ? "A four-question check reveals what stuck while the material is fresh." : "Choose a topic or add a session note next time to check what you learned."}</p>
      <div className={styles.heroActions}>
        <Button variant="secondary" onClick={onClose}>Not now</Button>
        {!signedIn ? <Link to="/signup">Create free account</Link> : topic ? <Button onClick={() => setChecking(true)}>Start quick check</Button> : null}
      </div>
    </>}
  </section>;
}
