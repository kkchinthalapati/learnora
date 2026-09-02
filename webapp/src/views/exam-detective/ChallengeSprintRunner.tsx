import { useState } from "react";
import type { SprintQuestion } from "../../api/aiExamDeconstructor";
import { markTrapDisarmed } from "../../api/aiExamDeconstructor";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AhaWalkthroughModal } from "./AhaWalkthroughModal";
import styles from "./examDetective.module.css";

interface ChallengeSprintRunnerProps {
  questions: SprintQuestion[];
  subject?: string;
  onComplete: (results: {
    disarmedCount: number;
    total: number;
    questions: SprintQuestion[];
  }) => void;
  onExit: () => void;
}

type ConfidenceLevel = "certain" | "tricky" | "guessed";

export function ChallengeSprintRunner({
  questions,
  subject,
  onComplete,
  onExit,
}: ChallengeSprintRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel>("certain");
  const [isAnswered, setIsAnswered] = useState(false);
  const [inspectBaitRevealed, setInspectBaitRevealed] = useState(false);
  const [activeWalkthroughTrapId, setActiveWalkthroughTrapId] = useState<
    string | null
  >(null);

  const [questionResults, setQuestionResults] = useState<
    Array<{
      question: SprintQuestion;
      selectedOption: number;
      isCorrect: boolean;
      confidence: ConfidenceLevel;
    }>
  >([]);

  const [isFinished, setIsFinished] = useState(false);

  if (questions.length === 0) {
    return (
      <div className={styles.runnerContainer}>
        <h3 className={styles.sectionTitle}>No questions found for sprint.</h3>
        <Button variant="secondary" onClick={onExit}>
          Return to Hub
        </Button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
  };

  const handleConfirmAnswer = () => {
    if (selectedOption === null) return;
    const isCorrect = selectedOption === currentQ.correctAnswerIndex;
    setIsAnswered(true);

    if (isCorrect) {
      markTrapDisarmed(currentQ.trapArchetypeId);
    }

    setQuestionResults((prev) => [
      ...prev,
      {
        question: currentQ,
        selectedOption,
        isCorrect,
        confidence,
      },
    ]);
  };

  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setInspectBaitRevealed(false);
      setConfidence("certain");
    } else {
      setIsFinished(true);
    }
  };

  const disarmedTotal = questionResults.filter((r) => r.isCorrect).length;

  if (isFinished) {
    return (
      <div className={styles.runnerContainer}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.heroEyebrow}>Challenge Sprint Completed</span>
            <h2 className={styles.heroTitle}>Sprint Debrief</h2>
          </div>
          <span className={`${styles.badgePill} ${styles.badgePillSuccess}`}>
            {disarmedTotal} / {questions.length} Traps Disarmed
          </span>
        </div>

        <div className={styles.disarmRuleBox}>
          <strong>Sprint Score:</strong> You disarmed {disarmedTotal} out of{" "}
          {questions.length} tricky professor traps! Keep practicing to build
          full immunity across all trap archetypes.
        </div>

        <div className={styles.optionsList}>
          {questionResults.map((res, idx) => (
            <div
              key={idx}
              className={
                res.isCorrect
                  ? styles.explanationCardSuccess
                  : styles.explanationCardBait
              }
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong>
                  Question {idx + 1}: {res.question.trapName}
                </strong>
                <span className={styles.badgePill}>
                  Confidence: {res.confidence}
                </span>
              </div>
              <p style={{ margin: "var(--s-1) 0 0 0", fontSize: "var(--fs-sm)" }}>
                {res.question.question}
              </p>
              <div style={{ marginTop: "var(--s-2)" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setActiveWalkthroughTrapId(res.question.trapArchetypeId)
                  }
                >
                  Inspect 4-Step Breakdown
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
          <Button
            variant="primary"
            onClick={() =>
              onComplete({
                disarmedCount: disarmedTotal,
                total: questions.length,
                questions,
              })
            }
          >
            Save & View Immunity Radar
          </Button>
          <Button variant="secondary" onClick={onExit}>
            Exit to Hub
          </Button>
        </div>

        {activeWalkthroughTrapId && (
          <AhaWalkthroughModal
            isOpen={true}
            trapId={activeWalkthroughTrapId}
            subject={subject}
            onClose={() => setActiveWalkthroughTrapId(null)}
          />
        )}
      </div>
    );
  }

  const isSelectedBait =
    isAnswered && selectedOption === currentQ.baitOptionIndex;
  const isSelectedCorrect =
    isAnswered && selectedOption === currentQ.correctAnswerIndex;

  return (
    <div className={styles.runnerContainer}>
      {/* Top bar */}
      <div className={styles.runnerHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <span className={`${styles.badgePill} ${styles.badgePillAccent}`}>
            Trap {currentIndex + 1} of {questions.length}
          </span>
          <span className={styles.badgePill}>{currentQ.trapName}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit Sprint
        </Button>
      </div>

      {/* Question prompt */}
      <div>
        <h3 className={styles.runnerQuestion}>{currentQ.question}</h3>
      </div>

      {/* Inspect Bait clue tool */}
      {!isAnswered && (
        <div>
          <button
            type="button"
            className={styles.tabBtn}
            onClick={() => setInspectBaitRevealed((prev) => !prev)}
            style={{ padding: "var(--s-1) var(--s-3)", fontSize: "var(--fs-xs)" }}
          >
            <Icon name="search" size={14} />
            <span>{inspectBaitRevealed ? "Hide Bait Clue" : "Inspect Bait Clue"}</span>
          </button>
          {inspectBaitRevealed && (
            <div className={styles.inspectBaitBox} style={{ marginTop: "var(--s-2)" }}>
              <strong>Detective Clue:</strong> {currentQ.hint}
            </div>
          )}
        </div>
      )}

      {/* Confidence Tags */}
      {!isAnswered && (
        <div className={styles.confidenceBar}>
          <span
            style={{
              fontSize: "var(--fs-xs)",
              fontWeight: 600,
              color: "var(--text-faint)",
            }}
          >
            Confidence Level:
          </span>
          {(["certain", "tricky", "guessed"] as ConfidenceLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.confidenceChip} ${
                confidence === level ? styles.confidenceChipActive : ""
              }`}
              onClick={() => setConfidence(level)}
            >
              {level === "certain" && "Certain (Clear)"}
              {level === "tricky" && "Tricky (Watch out)"}
              {level === "guessed" && "Guessed (Instinct)"}
            </button>
          ))}
        </div>
      )}

      {/* Options List */}
      <div className={styles.optionsList}>
        {currentQ.options.map((optionText, idx) => {
          const isSelected = selectedOption === idx;
          let optClass = styles.optionButton;
          if (isAnswered) {
            if (idx === currentQ.correctAnswerIndex) {
              optClass = `${styles.optionButton} ${styles.optionCorrect}`;
            } else if (idx === currentQ.baitOptionIndex && isSelected) {
              optClass = `${styles.optionButton} ${styles.optionBait}`;
            } else if (isSelected) {
              optClass = `${styles.optionButton} ${styles.optionBait}`;
            }
          } else if (isSelected) {
            optClass = `${styles.optionButton} ${styles.optionSelected}`;
          }

          return (
            <button
              key={idx}
              type="button"
              className={optClass}
              onClick={() => handleSelectOption(idx)}
              disabled={isAnswered}
            >
              <span
                style={{
                  fontWeight: 700,
                  minWidth: "24px",
                  color: isSelected ? "var(--accent-text)" : "var(--text-muted)",
                }}
              >
                {String.fromCharCode(65 + idx)}.
              </span>
              <span>{optionText}</span>
            </button>
          );
        })}
      </div>

      {/* Post-answer feedback */}
      {isAnswered && (
        <div
          className={
            isSelectedCorrect
              ? styles.explanationCardSuccess
              : styles.explanationCardBait
          }
        >
          <strong>
            {isSelectedCorrect
              ? "✨ Trap Disarmed! You spotted the trick!"
              : isSelectedBait
                ? "⚠️ Caught by the Bait! The professor predicted this."
                : "Not quite, but you're learning the pattern!"}
          </strong>

          {isSelectedBait && (
            <p style={{ margin: "var(--s-1) 0", fontSize: "var(--fs-sm)" }}>
              <strong>Why the bait was set:</strong> {currentQ.baitExplanation}
            </p>
          )}

          <p style={{ margin: "var(--s-1) 0 0 0", fontSize: "var(--fs-sm)" }}>
            <strong>Correct Reasoning:</strong> {currentQ.trapExplanation}
          </p>

          <div
            style={{
              display: "flex",
              gap: "var(--s-2)",
              marginTop: "var(--s-3)",
              alignItems: "center",
            }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveWalkthroughTrapId(currentQ.trapArchetypeId)}
            >
              Explore 4-Step Aha! Breakdown
            </Button>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-3)" }}>
        {!isAnswered ? (
          <Button
            variant="primary"
            onClick={handleConfirmAnswer}
            disabled={selectedOption === null}
          >
            Confirm Disarm Answer
          </Button>
        ) : (
          <Button variant="primary" onClick={handleNext}>
            {currentIndex + 1 < questions.length
              ? "Next Trap Challenge →"
              : "Finish Sprint"}
          </Button>
        )}
      </div>

      {activeWalkthroughTrapId && (
        <AhaWalkthroughModal
          isOpen={true}
          trapId={activeWalkthroughTrapId}
          subject={subject}
          onClose={() => setActiveWalkthroughTrapId(null)}
          onDisarmed={() => {
            markTrapDisarmed(activeWalkthroughTrapId);
          }}
        />
      )}
    </div>
  );
}
