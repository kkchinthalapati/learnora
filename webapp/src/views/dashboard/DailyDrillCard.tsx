import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import styles from "./dashboard.module.css";

export function DailyDrillCard() {
  const { data: dueCount } = useFlashcardsDueCount();
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
      <div className={styles.cardBody}>
        {totalDue > 0 ? (
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
