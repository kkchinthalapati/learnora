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

const TOTAL_SECONDS = 60;

export function MicroRepairModal({
  open,
  onClose,
  challenge,
  traceId,
  onRepairSuccess,
}: MicroRepairModalProps) {
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [showErrorFeedback, setShowErrorFeedback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state whenever modal opens or challenge changes
  useEffect(() => {
    if (open) {
      setTimeLeft(TOTAL_SECONDS);
      setSelectedOption(null);
      setIsVerified(false);
      setShowErrorFeedback(false);
      setIsSubmitting(false);
    }
  }, [open, challenge?.id]);

  // 60-second countdown ticker
  useEffect(() => {
    if (!open || isVerified || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [open, isVerified, timeLeft]);

  if (!challenge) return null;

  const exercise = challenge.interactiveExercise;
  const progressPercent = (timeLeft / TOTAL_SECONDS) * 100;
  const isUrgent = timeLeft <= 15;

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
      title="60-Second Micro-Repair Sandbox"
      subtitle={`Restoring Bedrock Foundation: "${challenge.rootConcept}"`}
      closeLabel="Close repair modal"
    >
      <div className={styles.repairContainer}>
        {/* 60s Timer Bar */}
        <div className={styles.timerBarWrapper} aria-label="Repair time countdown">
          <div className={styles.timerHeader}>
            <span>Target Intuition Pace</span>
            <span
              className={styles.timerCounter}
              aria-live="polite"
              data-testid="repair-timer-display"
            >
              {timeLeft}s remaining
            </span>
          </div>
          <div className={styles.progressBarBg}>
            <div
              className={`${styles.progressBarFill} ${isUrgent ? styles.progressUrgent : ""}`}
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={timeLeft}
              aria-valuemin={0}
              aria-valuemax={TOTAL_SECONDS}
            />
          </div>
        </div>

        {/* First-Principles Intuition Card */}
        <div className={styles.intuitionCard}>
          <div className={styles.intuitionHead}>
            <Icon name="zap" size={16} />
            <span>First-Principles Core Intuition</span>
          </div>
          <p className={styles.intuitionText} data-testid="repair-intuition-text">
            {challenge.intuitionSummary}
          </p>
        </div>

        {/* Interactive Verification Exercise */}
        <div className={styles.exerciseSection}>
          <h3 className={styles.exercisePrompt}>{exercise.prompt}</h3>

          <ul className={styles.optionsList} role="radiogroup" aria-label="Micro repair options">
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
              <span>Foundation Verified & Reconstructed!</span>
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
              <span>Prerequisite Invariant Violated</span>
            </div>
            <p className={styles.feedbackDetail}>
              Re-examine the core intuition above: ensure underlying conservation and rate
              relationships hold without shortcuts. Try another option!
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
              Verify Understanding
            </Button>
          ) : (
            <Button
              variant="success"
              onClick={handleApplyFix}
              disabled={isSubmitting}
              data-testid="apply-fix-btn"
            >
              <Icon name="check" size={16} />
              <span>{isSubmitting ? "Applying Fix..." : "Apply Fix to Circuit"}</span>
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
