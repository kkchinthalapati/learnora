import { useEffect, useState } from "react";
import type { MicroRepairChallenge } from "../../api/aiDebugger";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import styles from "./MicroRepairModal.module.css";

interface MicroRepairModalProps {
  open: boolean;
  onClose: () => void;
  challenge: MicroRepairChallenge | null;
  traceId: string;
  onRepairSuccess: (traceId: string, repairId: string) => Promise<void> | void;
}

export function MicroRepairModal({
  open,
  onClose,
  challenge,
  traceId,
  onRepairSuccess,
}: MicroRepairModalProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [showErrorFeedback, setShowErrorFeedback] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state whenever modal opens or challenge changes
  useEffect(() => {
    if (open) {
      setSelectedOption(null);
      setIsVerified(false);
      setShowErrorFeedback(false);
      setShowExplanation(false);
      setIsSubmitting(false);
    }
  }, [open, challenge?.id]);


  if (!challenge) return null;

  const exercise = challenge.interactiveExercise;

  const handleSelectOption = (index: number) => {
    if (isVerified) return;
    setSelectedOption(index);
    setShowErrorFeedback(false);
  };

  const handleVerify = () => {
    if (selectedOption === null) return;

    if (selectedOption === exercise.correctIndex) {
      setIsVerified(true);
      setShowErrorFeedback(false);
    } else {
      setShowErrorFeedback(true);
    }
  };

  const handleApplyFix = async () => {
    setIsSubmitting(true);
    try {
      await onRepairSuccess(traceId, challenge.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick check"
      subtitle="One question on first principles. No timer."
      closeLabel="Close the quick check"
    >
      <div className={styles.repairContainer}>
        {/* The plain-English idea */}
        <div className={styles.intuitionCard}>
          <div className={styles.intuitionHead}>
            <Icon name="zap" size={16} />
            <span>The idea, in plain English</span>
          </div>
          <p className={styles.intuitionText} data-testid="repair-intuition-text">
            {challenge.intuitionSummary}
          </p>
        </div>

        {/* Quick check */}
        <div className={styles.exerciseSection}>
          <h3 className={styles.exercisePrompt}>{exercise.prompt}</h3>

          <ul className={styles.optionsList} role="radiogroup" aria-label="Answer options">
            {exercise.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isOptionCorrect = isVerified && idx === exercise.correctIndex;
              const isOptionIncorrect =
                showErrorFeedback && isSelected && idx !== exercise.correctIndex;

              let optionClass = styles.optionButton;
              if (isOptionCorrect) {
                optionClass += ` ${styles.optionCorrect}`;
              } else if (isOptionIncorrect) {
                optionClass += ` ${styles.optionIncorrect}`;
              } else if (isSelected) {
                optionClass += ` ${styles.optionSelected}`;
              }

              return (
                <li key={idx}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={optionClass}
                    onClick={() => handleSelectOption(idx)}
                    disabled={isVerified}
                    data-testid={`repair-option-${idx}`}
                  >
                    <span className={styles.optionMarker}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Feedback Display */}
        {isVerified && (
          <div className={`${styles.feedbackCard} ${styles.feedbackSuccess}`} role="status">
            <div className={styles.feedbackTitle}>
              <Icon name="check" size={18} />
              <span>That's it — you've got it</span>
            </div>
            <p className={styles.feedbackDetail}>
              {exercise.firstPrinciplesExplanation}
            </p>
          </div>
        )}

        {showExplanation && !isVerified && (
          <div className={styles.feedbackCard} role="status">
            <div className={styles.feedbackTitle}>
              <Icon name="zap" size={18} />
              <span>Here is the reasoning</span>
            </div>
            <p className={styles.feedbackDetail}>
              {exercise.firstPrinciplesExplanation}
            </p>
          </div>
        )}

        {showErrorFeedback && (
          <div className={`${styles.feedbackCard} ${styles.feedbackError}`} role="alert">
            <div className={styles.feedbackTitle}>
              <Icon name="alert-triangle" size={18} />
              <span>Not quite</span>
            </div>
            <p className={styles.feedbackDetail}>
              Have another look at the idea above and check each step, rather than
              jumping to the answer. Give it another go.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          {!isVerified ? (
            <Button
              variant="primary"
              onClick={handleVerify}
              disabled={selectedOption === null}
              data-testid="verify-repair-btn"
            >
              Check my answer
            </Button>
          ) : (
            <Button
              variant="success"
              onClick={handleApplyFix}
              disabled={isSubmitting}
              data-testid="apply-fix-btn"
            >
              <Icon name="check" size={16} />
              <span>{isSubmitting ? "Saving…" : "Mark it as sorted"}</span>
            </Button>
          )}
        </div>

        {!isVerified && !showExplanation && (
          <button
            type="button"
            className={styles.skipLink}
            onClick={() => {
              setShowExplanation(true);
              setShowErrorFeedback(false);
            }}
            data-testid="skip-to-explanation-btn"
          >
            Skip — just show me the explanation
          </button>
        )}
      </div>
    </Modal>
  );
}
