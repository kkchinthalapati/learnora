import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useWeakTopics } from "../../hooks/useQuizzes";
import styles from "./dashboard.module.css";

export function DailyDrillCard() {
  const { data: dueCount, isPending } = useFlashcardsDueCount();
  const { data: weakTopics } = useWeakTopics(2);
  const navigate = useNavigate();
  const totalDue = dueCount || 0;
  const drillSize = Math.min(totalDue, 20);

  return (
    <Card variant="elevated" className={styles.drillCard}>
      <div className={styles.drillHeader}>
        <span className={styles.drillIcon} aria-hidden="true">
          <Icon name="zap" size={17} />
        </span>
        <div>
          <span className={styles.eyebrow}>Daily drill</span>
          <h2 className={styles.drillTitle}>Five-minute recall</h2>
        </div>
      </div>
      <div className={styles.drillBody} aria-busy={isPending || undefined}>
        {isPending ? (
          <Skeleton label="Loading today's due cards" height={40} />
        ) : totalDue > 0 ? (
          <>
            <p className={styles.drillCopy}>
              <strong>{totalDue}</strong> card{totalDue === 1 ? "" : "s"} due.
              This drill will pull up to {drillSize} across your decks.
            </p>
            {weakTopics && weakTopics.length > 0 ? (
              <div className={styles.weakTopics} style={{ marginTop: "var(--s-2)" }}>
                <span className={styles.weakTopicsLabel}>Struggling with: </span>
                {weakTopics.slice(0, 2).map((t) => (
                  <span key={t.topic} className={styles.weakTopicPill}>
                    {t.topic}
                  </span>
                ))}
              </div>
            ) : null}
            <Button
              variant="primary"
              className={styles.drillAction}
              onClick={() => navigate("/review/daily-drill")}
            >
              Start drill
            </Button>
          </>
        ) : (
          <>
            <p className={styles.drillCopy}>
              You&apos;re caught up. Add cards from a subject to keep recall
              practice ready for tomorrow.
            </p>
            <Button
              className={styles.drillAction}
              onClick={() => navigate("/library/flashcards")}
            >
              Open flashcards
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
