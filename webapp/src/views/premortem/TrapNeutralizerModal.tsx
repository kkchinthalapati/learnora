import { useState, useEffect } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import {
  getTrapNeutralizer,
  type TrapNeutralizer,
  type TrapNeutralizerAnatomy,
} from "../../api/aiPreMortem";
import styles from "./TrapNeutralizerModal.module.css";

interface TrapNeutralizerModalProps {
  trapId: string | null;
  open: boolean;
  onClose: () => void;
  onNeutralized?: (trapId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

export function TrapNeutralizerModal({
  trapId,
  open,
  onClose,
  onNeutralized,
}: TrapNeutralizerModalProps) {
  const [neutralizer, setNeutralizer] = useState<TrapNeutralizer | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);

  useEffect(() => {
    if (!open || !trapId) {
      setCurrentStep(1);
      setSelectedAnswer(null);
      setIsAnswerSubmitted(false);
      return;
    }

    setLoading(true);
    getTrapNeutralizer(trapId)
      .then((data) => {
        setNeutralizer(data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, trapId]);

  if (!open || !trapId) return null;

  const anatomy: TrapNeutralizerAnatomy =
    typeof neutralizer?.anatomyOfTrick === "object"
      ? neutralizer.anatomyOfTrick
      : {
          bait: "Instinctive quick answer that feels superficially correct.",
          hiddenFlaw:
            typeof neutralizer?.anatomyOfTrick === "string"
              ? neutralizer.anatomyOfTrick
              : "Hidden boundary violation or negative phrasing qualifier.",
          disarmRule: "Apply the invariant precondition checklist before computing.",
        };

  const handleSelectOption = (idx: number) => {
    if (isAnswerSubmitted) return;
    setSelectedAnswer(idx);
  };

  const handleVerifyAnswer = () => {
    if (selectedAnswer === null) return;
    setIsAnswerSubmitted(true);
    if (
      neutralizer &&
      selectedAnswer === neutralizer.practiceChallenge.answer &&
      onNeutralized
    ) {
      onNeutralized(neutralizer.id);
    }
  };

  const isChallengeCorrect =
    neutralizer !== null &&
    selectedAnswer === neutralizer.practiceChallenge.answer;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={neutralizer?.trapName || "Trap Neutralizer"}
      subtitle="Interactive 3-Step Trick Deconstruction & Micro-Drill"
      contentClassName={styles.container}
    >
      {loading ? (
        <div style={{ padding: "var(--s-8)", textAlign: "center" }}>
          <p>Analyzing professor trick anatomy...</p>
        </div>
      ) : neutralizer ? (
        <>
          {/* Stepper Header */}
          <nav className={styles.stepIndicator} aria-label="Neutralizer steps">
            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 1 ? styles.stepItemActive : ""
              } ${currentStep > 1 ? styles.stepItemCompleted : ""}`}
              onClick={() => setCurrentStep(1)}
            >
              <span className={styles.stepBadge}>
                {currentStep > 1 ? <Icon name="check" size={12} /> : "1"}
              </span>
              <span>1. The Bait</span>
            </button>

            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 2 ? styles.stepItemActive : ""
              } ${currentStep > 2 ? styles.stepItemCompleted : ""}`}
              onClick={() => setCurrentStep(2)}
            >
              <span className={styles.stepBadge}>
                {currentStep > 2 ? <Icon name="check" size={12} /> : "2"}
              </span>
              <span>2. Hidden Flaw</span>
            </button>

            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 3 ? styles.stepItemActive : ""
              } ${currentStep > 3 ? styles.stepItemCompleted : ""}`}
              onClick={() => setCurrentStep(3)}
            >
              <span className={styles.stepBadge}>
                {currentStep > 3 ? <Icon name="check" size={12} /> : "3"}
              </span>
              <span>3. Disarm Rule</span>
            </button>

            <button
              type="button"
              className={`${styles.stepItem} ${
                currentStep === 4 ? styles.stepItemActive : ""
              } ${isAnswerSubmitted && isChallengeCorrect ? styles.stepItemCompleted : ""}`}
              onClick={() => setCurrentStep(4)}
            >
              <span className={styles.stepBadge}>
                {isAnswerSubmitted && isChallengeCorrect ? (
                  <Icon name="check" size={12} />
                ) : (
                  "4"
                )}
              </span>
              <span>Practice Drill</span>
            </button>
          </nav>

          {/* Step 1: The Bait */}
          {currentStep === 1 && (
            <div className={styles.stepContent}>
              <Card
                variant="panel"
                padding="md"
                className={`${styles.deconstructionCard} ${styles.baitCard}`}
              >
                <div className={`${styles.sectionHeader} ${styles.baitHeader}`}>
                  <Icon name="alert-triangle" size={18} />
                  <span>The Professor's Bait</span>
                </div>
                <p className={styles.sectionText}>{anatomy.bait}</p>
              </Card>

              <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
                Professors engineer answer choices around intuitive psychological shortcuts.
                Next, let's reveal the mathematical or logical flaw hidden inside.
              </p>
            </div>
          )}

          {/* Step 2: The Hidden Flaw */}
          {currentStep === 2 && (
            <div className={styles.stepContent}>
              <Card
                variant="panel"
                padding="md"
                className={`${styles.deconstructionCard} ${styles.flawCard}`}
              >
                <div className={`${styles.sectionHeader} ${styles.flawHeader}`}>
                  <Icon name="alert-circle" size={18} />
                  <span>The Hidden Structural Flaw</span>
                </div>
                <p className={styles.sectionText}>{anatomy.hiddenFlaw}</p>
              </Card>

              <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
                Once you spot the hidden failure condition, the trap loses all surprise value.
                Now review the actionable disarm rule.
              </p>
            </div>
          )}

          {/* Step 3: The Disarm Rule */}
          {currentStep === 3 && (
            <div className={styles.stepContent}>
              <Card
                variant="panel"
                padding="md"
                className={`${styles.deconstructionCard} ${styles.ruleCard}`}
              >
                <div className={`${styles.sectionHeader} ${styles.ruleHeader}`}>
                  <Icon name="shield" size={18} />
                  <span>The Invariant Disarm Protocol</span>
                </div>
                <p className={styles.sectionText}>{anatomy.disarmRule}</p>

                <ul className={styles.rulesList}>
                  {neutralizer.disarmRules.map((rule, idx) => (
                    <li key={idx} className={styles.ruleListItem}>
                      <Icon name="check" size={16} className={styles.ruleListIcon} />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* Step 4: Verification Practice Challenge */}
          {currentStep === 4 && (
            <div className={styles.stepContent}>
              <Card variant="panel" padding="md">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                    marginBottom: "var(--s-2)",
                    color: "var(--accent)",
                    fontWeight: 700,
                    fontSize: "var(--fs-xs)",
                    textTransform: "uppercase",
                  }}
                >
                  <Icon name="target" size={16} />
                  <span>1-Question Trap Verification Challenge</span>
                </div>

                <p className={styles.challengePrompt}>
                  {neutralizer.practiceChallenge.question}
                </p>

                <div className={styles.optionsList}>
                  {neutralizer.practiceChallenge.options.map((opt, idx) => {
                    const isSelected = selectedAnswer === idx;
                    const isCorrectOption =
                      idx === neutralizer.practiceChallenge.answer;

                    let optionClass = styles.optionButton;
                    if (isAnswerSubmitted) {
                      if (isCorrectOption) optionClass += ` ${styles.optionCorrect}`;
                      else if (isSelected) optionClass += ` ${styles.optionWrong}`;
                    } else if (isSelected) {
                      optionClass += ` ${styles.optionButtonSelected}`;
                    }

                    const letters = ["A", "B", "C", "D"];

                    return (
                      <button
                        key={idx}
                        type="button"
                        className={optionClass}
                        onClick={() => handleSelectOption(idx)}
                        disabled={isAnswerSubmitted}
                      >
                        <span className={styles.optionLetter}>{letters[idx]}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {isAnswerSubmitted && (
                  <div
                    className={`${styles.feedbackBox} ${
                      isChallengeCorrect
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }`}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--s-2)",
                        fontWeight: 700,
                        marginBottom: "var(--s-1)",
                      }}
                    >
                      <Icon
                        name={isChallengeCorrect ? "check" : "alert-triangle"}
                        size={16}
                      />
                      <span>
                        {isChallengeCorrect
                          ? "Trap Neutralized! Deflection Successful."
                          : "Trap Triggered. Study the explanation below."}
                      </span>
                    </div>
                    <p>{neutralizer.practiceChallenge.explanation}</p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Navigation Controls */}
          <div className={styles.actionsRow}>
            {currentStep > 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentStep((s) => (s - 1) as Step)}
              >
                Previous Step
              </Button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCurrentStep((s) => (s + 1) as Step)}
              >
                Next:{" "}
                {currentStep === 1
                  ? "The Hidden Flaw"
                  : currentStep === 2
                  ? "The Disarm Rule"
                  : "Practice Drill"}
              </Button>
            ) : !isAnswerSubmitted ? (
              <Button
                variant="primary"
                size="sm"
                disabled={selectedAnswer === null}
                onClick={handleVerifyAnswer}
              >
                Check Deflection
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onClose}>
                Done & Return to Radar
              </Button>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
