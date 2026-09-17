import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { QuickCheck, type QuickCheckResult } from "../../components/quickcheck/QuickCheck";
import { useOptionalAuth } from "../../context/auth";
import type { LocalSession } from "../../lib/localSessions";
import styles from "./today.module.css";

export function SessionCompletePanel({ session, onClose }: { session: LocalSession; onClose: () => void }) {
  const signedIn = Boolean(useOptionalAuth()?.session);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<QuickCheckResult | null>(null);
  const topic = ["None", "General Study"].includes(session.task) ? session.notes : session.task;
  return <section className={styles.region} aria-label="Session complete">
    <h2 className={styles.regionTitle}>Session complete: {session.task}</h2>
    {result ? <>
      <p role="status">{result.correct}/{result.total} correct. {result.change ? `${session.task}: ${result.change}. ` : ""}{result.saved ? "Your next step is updated from this check." : "Your result is shown locally; account sync is pending."}</p>
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
