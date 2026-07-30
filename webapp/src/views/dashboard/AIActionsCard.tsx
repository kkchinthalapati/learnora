import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useToast } from "../../context/toast";
import { useWeakTopics } from "../../hooks/useQuizzes";
import styles from "./dashboard.module.css";

/* "Ask Learnora AI" card — ports index.html:533-573.
 *
 * The four buttons ("Plan my week", "What next?", "Quiz me", "Summarize
 * notes") all call into `js/ai.js`, which does not exist in the React app
 * yet — ledger step 14. Rather than omit the card (a visual regression on
 * every other card's row) or hide it behind a route that doesn't exist,
 * each button opens with the same "not connected yet" message Step 6's
 * MaterialPanel already established for the same reason: a real, visible
 * affordance that is honest about not doing anything yet, not a silent
 * dead end.
 *
 * The weak-topics chips beneath them are NOT AI-gated — `fetchWeakTopics`
 * only aggregates `quiz_attempts.weak_topics`, a plain read that has existed
 * since Step 5 — so they're wired for real. */

const NOT_CONNECTED_MESSAGE =
  "AI features aren't connected yet — Step 14 wires this up.";

const ACTIONS: { icon: IconName; label: string }[] = [
  { icon: "calendar-week", label: "Plan my week" },
  { icon: "target", label: "What next?" },
  { icon: "brain", label: "Quiz me" },
  { icon: "file-text", label: "Summarize notes" },
];

export function AIActionsCard() {
  const { showToast } = useToast();
  const { data: weakTopics } = useWeakTopics(3);

  return (
    <div className={`${styles.card} ${styles.aiCard}`}>
      <span className={styles.eyebrow}>Ask Learnora AI</span>
      <p className={styles.sub}>Turn your workload into a plan in one tap.</p>
      <div className={styles.aiActions}>
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className={styles.aiBtn}
            onClick={() => showToast(NOT_CONNECTED_MESSAGE)}
          >
            <span className={styles.aiIcon}>
              <Icon name={a.icon} size={18} />
            </span>
            {a.label}
          </button>
        ))}
      </div>
      {weakTopics && weakTopics.length > 0 ? (
        <div className={styles.weakTopics}>
          <span className={styles.weakTopicsLabel}>Struggling with: </span>
          {weakTopics.map((t) => (
            <span key={t.topic} className={styles.weakTopicPill}>
              {t.topic}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
