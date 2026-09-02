import { useNavigate } from "react-router";
import type { StudyBuddyCheckItem } from "../../hooks/useStudyBuddyChecks";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import styles from "./studyBuddy.module.css";

interface StudyBuddyCardProps {
  check: StudyBuddyCheckItem;
  onAcceptFix?: (check: StudyBuddyCheckItem) => void;
  onDismiss?: (id: string) => void;
  onClose?: () => void;
}

export function StudyBuddyCard({
  check,
  onAcceptFix,
  onDismiss,
  onClose,
}: StudyBuddyCardProps) {
  const navigate = useNavigate();

  const handleSparringBridge = () => {
    navigate("/sparring");
  };

  const handleExamTrickBridge = () => {
    navigate("/exam-detective");
  };

  const getTypeLabel = (type: StudyBuddyCheckItem["type"]) => {
    switch (type) {
      case "contradiction":
        return "Contradiction Check";
      case "logic_jump":
        return "Logic Jump / Missing Step";
      case "muddy_concept":
        return "Muddy Concept";
      case "exam_trap_risk":
        return "Exam Trap Alert";
      default:
        return "Study Buddy Tip";
    }
  };

  return (
    <div
      className={styles.cardContainer}
      role="dialog"
      aria-label={check.title}
    >
      {/* Header */}
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.typeBadge}>
            <Icon name="sparkles" size={12} style={{ marginRight: "var(--s-1)" }} />
            {getTypeLabel(check.type)}
          </span>
          <h4 className={styles.cardTitle} style={{ marginTop: "var(--s-1)" }}>
            {check.title}
          </h4>
        </div>
        <button
          type="button"
          className={styles.gutterBadgeBtn}
          style={{ width: "22px", height: "22px" }}
          onClick={onClose || (() => onDismiss?.(check.id))}
          aria-label="Close tip"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Message */}
      <p className={styles.cardMessage}>{check.friendlyMessage}</p>

      {/* Snippet */}
      {check.highlightSnippet && (
        <div className={styles.snippetBox} title={check.highlightSnippet}>
          &ldquo;{check.highlightSnippet}&rdquo;
        </div>
      )}

      {/* Suggested Fix */}
      {check.suggestedFix && (
        <div className={styles.suggestedFixBox}>
          <strong>Suggested Improvement:</strong>
          <p style={{ margin: "var(--s-1) 0 0 0" }}>{check.suggestedFix}</p>
        </div>
      )}

      {/* Actions */}
      <div className={styles.cardActions}>
        {check.suggestedFix && onAcceptFix && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onAcceptFix(check)}
          >
            Accept suggested fix ✓
          </Button>
        )}

        {/* 1-click Bridges */}
        <div className={styles.bridgeButtonsRow}>
          <button
            type="button"
            className={styles.bridgeButton}
            onClick={handleSparringBridge}
            title="Practice explaining this concept in the Socratic Studio"
          >
            <Icon name="mic" size={12} />
            <span>Spar with Alex & Jordan</span>
          </button>
          <button
            type="button"
            className={styles.bridgeButton}
            onClick={handleExamTrickBridge}
            title="Open Exam Detective simulator"
          >
            <Icon name="search" size={12} />
            <span>Practice exam trick</span>
          </button>
        </div>
      </div>
    </div>
  );
}
