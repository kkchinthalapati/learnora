import { Button } from "../Button";
import styles from "./learning.module.css";

/* When the tutor fails, say it in the thread — what happened, what was kept,
   what to do, and whether retrying is safe — rather than a toast or a red
   "Something went wrong." */
export function AiErrorCard({
  detail,
  onRetry,
  onFallback,
  fallbackLabel = "Switch to flashcards meanwhile",
  kept = "Your message is saved below, so nothing was lost, and retrying won't send it twice.",
}: {
  /** The service's own sentence, when it gave one. */
  detail?: string;
  onRetry?: () => void;
  onFallback?: () => void;
  fallbackLabel?: string;
  kept?: string;
}) {
  return (
    <div className={styles.aiError} role="alert">
      <p className={styles.aiErrorTitle}>The tutor didn't answer that one.</p>
      <p className={styles.aiErrorBody}>
        {detail ? `${detail} ` : "The AI service is busy. "}
        {kept}
      </p>
      {onRetry || onFallback ? (
        <div className={styles.aiErrorActions}>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {onFallback ? (
            <Button variant="ghost" size="sm" onClick={onFallback}>
              {fallbackLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
