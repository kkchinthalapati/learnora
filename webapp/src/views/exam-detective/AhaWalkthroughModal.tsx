import { useEffect, useState } from "react";
import {
  getAhaDisarmWalkthrough,
  markTrapDisarmed,
  type AhaDisarmWalkthrough,
} from "../../api/aiExamDeconstructor";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import styles from "./examDetective.module.css";

interface AhaWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  trapId: string;
  subject?: string;
  onDisarmed?: (trapId: string) => void;
}

export function AhaWalkthroughModal({
  isOpen,
  onClose,
  trapId,
  subject,
  onDisarmed,
}: AhaWalkthroughModalProps) {
  const [data, setData] = useState<AhaDisarmWalkthrough | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedChallengeOption, setSelectedChallengeOption] = useState<
    number | null
  >(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isImmune, setIsImmune] = useState(false);

  useEffect(() => {
    if (isOpen && trapId) {
      setStep(1);
      setSelectedChallengeOption(null);
      setIsAnswerSubmitted(false);
      setIsImmune(false);
      void getAhaDisarmWalkthrough(trapId, subject).then((res) => setData(res));
    }
  }, [isOpen, trapId, subject]);

  if (!isOpen || !data) return null;

  const handleSelectChallenge = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedChallengeOption(index);
  };

  const handleVerifyChallenge = () => {
    if (selectedChallengeOption === null) return;
    setIsAnswerSubmitted(true);
    if (
      selectedChallengeOption === data.step4DisarmChallenge.correctAnswerIndex
    ) {
      setIsImmune(true);
      markTrapDisarmed(trapId);
      onDisarmed?.(trapId);
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aha! Disarm Walkthrough"
    >
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroEyebrow}>4-Step Aha! Breakdown</span>
            <h2 className={styles.modalTitle}>{data.trapName}</h2>
          </div>
          <button
            type="button"
            className={styles.tabBtn}
            onClick={onClose}
            aria-label="Close walkthrough"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div className={styles.stepperBar}>
          <button
            type="button"
            className={`${styles.stepPill} ${
              step === 1
                ? styles.stepPillActive
                : step > 1
                  ? styles.stepPillDone
                  : ""
            }`}
            onClick={() => setStep(1)}
          >
            <span>1</span> Spotting the Bait
          </button>
          <button
            type="button"
            className={`${styles.stepPill} ${
              step === 2
                ? styles.stepPillActive
                : step > 2
                  ? styles.stepPillDone
                  : ""
            }`}
            onClick={() => setStep(2)}
          >
            <span>2</span> The Sneaky Trick
          </button>
          <button
            type="button"
            className={`${styles.stepPill} ${
              step === 3
                ? styles.stepPillActive
                : step > 3
                  ? styles.stepPillDone
                  : ""
            }`}
            onClick={() => setStep(3)}
          >
            <span>3</span> Detective Rule
          </button>
          <button
            type="button"
            className={`${styles.stepPill} ${
              step === 4
                ? styles.stepPillActive
                : isImmune
                  ? styles.stepPillDone
                  : ""
            }`}
            onClick={() => setStep(4)}
          >
            <span>4</span> Disarm Challenge
          </button>
        </div>

        {/* Body Content by Step */}
        <div className={styles.modalBody}>
          {step === 1 && (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {data.step1Bait.title}
                </h3>
                <span
                  className={`${styles.badgePill} ${styles.badgePillAccent}`}
                >
                  Step 1: Spot the Bait
                </span>
              </div>
              <p className={styles.trapDesc}>{data.step1Bait.description}</p>
              <div className={styles.exampleBox}>
                <span className={styles.exampleLabel}>Juicy Bait Example</span>
                <p style={{ margin: 0 }}>{data.step1Bait.baitExample}</p>
              </div>
              <div className={styles.disarmRuleBox}>
                <strong>Why students get tricked:</strong>{" "}
                {data.step1Bait.whyItTricksStudents}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {data.step2SneakyTrick.title}
                </h3>
                <span
                  className={`${styles.badgePill} ${styles.badgePillAccent}`}
                >
                  Step 2: Behind the Scenes
                </span>
              </div>
              <p className={styles.trapDesc}>
                {data.step2SneakyTrick.mechanism}
              </p>
              <div className={styles.exampleBox}>
                <span className={styles.exampleLabel}>
                  How the Distractor is Designed
                </span>
                <p style={{ margin: 0 }}>
                  {data.step2SneakyTrick.distractorDesign}
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {data.step3DetectiveRule.title}
                </h3>
                <span
                  className={`${styles.badgePill} ${styles.badgePillSuccess}`}
                >
                  Step 3: Disarm Protocol
                </span>
              </div>
              <div className={styles.disarmRuleBox}>
                <strong>Detective Rule:</strong>{" "}
                {data.step3DetectiveRule.ruleStatement}
              </div>
              <div className={styles.exampleBox}>
                <span className={styles.exampleLabel}>Field Checklist</span>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "var(--s-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--s-1)",
                  }}
                >
                  {data.step3DetectiveRule.checklist.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <p
                style={{
                  fontStyle: "italic",
                  color: "var(--accent-text)",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                &ldquo;{data.step3DetectiveRule.motto}&rdquo;
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  {data.step4DisarmChallenge.title}
                </h3>
                {isImmune && (
                  <span
                    className={`${styles.badgePill} ${styles.badgePillSuccess}`}
                  >
                    ✨ Trap Immune!
                  </span>
                )}
              </div>
              <p className={styles.trapDesc}>
                {data.step4DisarmChallenge.scenario}
              </p>

              <div className={styles.optionsList}>
                {data.step4DisarmChallenge.options.map((opt, idx) => {
                  const isSelected = selectedChallengeOption === idx;
                  const isCorrect =
                    idx === data.step4DisarmChallenge.correctAnswerIndex;
                  let optionClass = styles.optionButton;
                  if (isAnswerSubmitted) {
                    if (isCorrect)
                      optionClass = `${styles.optionButton} ${styles.optionCorrect}`;
                    else if (isSelected)
                      optionClass = `${styles.optionButton} ${styles.optionBait}`;
                  } else if (isSelected) {
                    optionClass = `${styles.optionButton} ${styles.optionSelected}`;
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={optionClass}
                      onClick={() => handleSelectChallenge(idx)}
                      disabled={isAnswerSubmitted}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          minWidth: "20px",
                        }}
                      >
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {!isAnswerSubmitted ? (
                <Button
                  variant="primary"
                  onClick={handleVerifyChallenge}
                  disabled={selectedChallengeOption === null}
                >
                  Verify Disarm Answer
                </Button>
              ) : (
                <div
                  className={
                    isImmune
                      ? styles.explanationCardSuccess
                      : styles.explanationCardBait
                  }
                >
                  <strong style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
                    {isImmune ? "✨ Trap Immune!" : "Almost there!"}
                  </strong>
                  <p style={{ margin: "var(--s-1) 0 0 0", fontSize: "var(--fs-sm)" }}>
                    {data.step4DisarmChallenge.explanation}
                  </p>
                  {isImmune && (
                    <p
                      style={{
                        margin: "var(--s-1) 0 0 0",
                        fontWeight: 600,
                        fontSize: "var(--fs-xs)",
                      }}
                    >
                      {data.step4DisarmChallenge.celebrationNote}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation */}
        <div className={styles.modalFooter}>
          <Button
            variant="ghost"
            disabled={step === 1}
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))}
          >
            Previous Step
          </Button>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            {step < 4 ? (
              <Button
                variant="secondary"
                onClick={() => setStep((s) => (s < 4 ? ((s + 1) as any) : s))}
              >
                Next Step →
              </Button>
            ) : (
              <Button variant="primary" onClick={onClose}>
                {isImmune ? "Complete & Return" : "Done"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
