import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import styles from "./dashboard.module.css";

export function DailyDrillCard() {
  const { data: dueCount, isPending } = useFlashcardsDueCount();
  const navigate = useNavigate();
  const totalDue = dueCount || 0;

  return (
    <Card className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <div className={`${styles.cardIcon} ${styles.blueIcon}`}>
            <Icon name="zap" size={16} />
          </div>
          <h2 className={styles.cardTitle}>Daily 5-Minute Drill</h2>
        </div>
      </div>
      <div className={styles.cardBody} aria-busy={isPending || undefined}>
        {isPending ? (
          /* Was previously "no cards due" during this same window — dueCount
             defaults to undefined while the query is in flight, and `|| 0`
             silently turned that into a false "you're all caught up". */
          <Skeleton label="Loading today's due cards" height={40} />
        ) : totalDue > 0 ? (
          <>
            <p className={styles.cardText}>
              You have <strong>{totalDue}</strong> cards due across all subjects.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate("/review/daily-drill")}
            >
              Start Drill
            </Button>
          </>
        ) : (
          <p className={styles.mutedText}>
            You're all caught up! No cards due.
          </p>
        )}
      </div>
    </Card>
  );
}
