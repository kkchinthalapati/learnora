import { Button } from "../../components/Button";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { TutorTurn } from "../../components/learning/TutorTurn";
import styles from "./session.module.css";

/* What a mode shows while its AI call is out, and when it fails or is
   stopped. The streaming cursor, a Stop, and a caption naming what the
   tutor is reading. */
export function Pending({
  pending,
  error,
  stopped,
  caption,
  onStop,
  onRetry,
  onFallback,
}: {
  pending: boolean;
  error: string | null;
  stopped: boolean;
  caption: string;
  onStop: () => void;
  onRetry: () => void;
  onFallback?: () => void;
}) {
  if (pending) {
    return (
      <div className={styles.thread} aria-live="polite">
        <TutorTurn streaming />
        <div className={styles.streaming}>
          <Button variant="secondary" size="sm" onClick={onStop}>
            Stop
          </Button>
          <p className={styles.caption}>{caption}</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <AiErrorCard
        detail={error}
        onRetry={onRetry}
        onFallback={onFallback}
        kept="Your session is saved, so nothing was lost, and retrying is safe."
      />
    );
  }
  if (stopped) {
    return (
      <div className={styles.streaming}>
        <p className={styles.caption}>Stopped. Nothing was lost.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  return null;
}
