import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import {
  evaluatePreMortemTest,
  DEFAULT_TRAP_ARCHETYPES,
  type StressQuestion,
  type PreMortemReport,
} from "../../api/aiPreMortem";
import styles from "./StressTestRunner.module.css";

interface StressTestRunnerProps {
  subject?: string;
  questions: StressQuestion[];
  timeLimitSeconds?: number;
  onComplete?: (report: PreMortemReport) => void;
  onCancel?: () => void;
}

type ConfidenceLevel = "high" | "tricky" | "guess";

export function StressTestRunner({
  subject = "Exam Pre-Mortem Gauntlet",
  questions,
  timeLimitSeconds = 300, // 5 minutes default
  onComplete,
  onCancel,
}: StressTestRunnerProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confidenceTags, setConfidenceTags] = useState<
    Record<string, ConfidenceLevel>
  >({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(
    new Set()
  );
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const report = await evaluatePreMortemTest(subject, answers, questions);
      if (onComplete) {
        onComplete(report);
      } else {
        navigate("/premortem/radar");
      }
    } catch (err) {
      console.error("Failed to evaluate pre-mortem test", err);
      setIsSubmitting(false);
    }
  }, [isSubmitting, subject, answers, questions, onComplete, navigate]);

  useEffect(() => {
    if (isTimerPaused || isSubmitting) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerPaused, isSubmitting, handleSubmit]);

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (optionIndex: number) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: optionIndex,
    }));
  };

  const handleSetConfidence = (level: ConfidenceLevel) => {
    if (!currentQuestion) return;
    setConfidenceTags((prev) => ({
      ...prev,
      [currentQuestion.id]: level,
    }));
  };

  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  };

  if (!questions || questions.length === 0) {
    return (
      <div className={styles.container}>
        <Card variant="panel" padding="lg" style={{ textAlign: "center" }}>
          <h2>No Gauntlet Questions Loaded</h2>
          <p style={{ margin: "var(--s-4) 0", color: "var(--text-muted)" }}>
            Please select trap archetypes and launch the gauntlet from the hub.
          </p>
          <Button
            variant="primary"
            onClick={() => (onCancel ? onCancel() : navigate("/premortem"))}
          >
            Back to Pre-Mortem Hub
          </Button>
        </Card>
      </div>
    );
  }

  // Format MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerFormatted = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  const currentTrap = DEFAULT_TRAP_ARCHETYPES.find(
    (a) => a.id === currentQuestion.trapArchetypeId
  );

  const isCurrentFlagged = flaggedQuestions.has(currentQuestion.id);
  const currentConfidence = confidenceTags[currentQuestion.id];
  const selectedOptionIndex = answers[currentQuestion.id];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className={styles.container}>
      {/* Top Controls Header */}
      <header className={styles.topBar}>
        <div>
          <span className={styles.subjectTitle}>{subject}</span>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
            Adversarial Professor Stress-Test • Question {currentIndex + 1} of{" "}
            {questions.length} ({answeredCount} answered)
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <div
            className={`${styles.timerBadge} ${
              timeLeft < 60 ? styles.timerUrgent : ""
            }`}
            aria-label={`Time remaining: ${timerFormatted}`}
          >
            <Icon name="clock" size={16} />
            <span>{timerFormatted}</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsTimerPaused((p) => !p)}
            aria-label={isTimerPaused ? "Resume Timer" : "Pause Timer"}
          >
            <Icon name={isTimerPaused ? "play" : "pause"} size={16} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => (onCancel ? onCancel() : navigate("/premortem"))}
          >
            Exit
          </Button>
        </div>
      </header>

      {/* Adversarial Trap Warning Indicator */}
      {currentTrap && (
        <div className={styles.adversarialBanner}>
          <Icon name="alert-triangle" size={20} className={styles.trapIcon} />
          <div>
            <span className={styles.trapLabel}>
              Adversarial Ambush Detected: {currentTrap.name}
            </span>
            <p style={{ margin: 0 }}>
              {currentTrap.description} Keep an eye out for deceptive options.
            </p>
          </div>
        </div>
      )}

      {/* Question Jumper Grid */}
      <nav className={styles.jumperBar} aria-label="Question Navigation Jumper">
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = answers[q.id] !== undefined;
          const isFlagged = flaggedQuestions.has(q.id);

          let btnClass = styles.jumperButton;
          if (isCurrent) btnClass += ` ${styles.jumperCurrent}`;
          else if (isAnswered) btnClass += ` ${styles.jumperAnswered}`;
          if (isFlagged) btnClass += ` ${styles.jumperFlagged}`;

          return (
            <button
              key={q.id}
              type="button"
              className={btnClass}
              onClick={() => {
                setCurrentIndex(idx);
                setShowHint(false);
              }}
              aria-label={`Go to question ${idx + 1}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </nav>

      {/* Main Question Card */}
      <main className={styles.questionCard}>
        <div className={styles.questionHeader}>
          <div className={styles.questionMeta}>
            <span
              className={`${styles.questionBadge} ${
                currentQuestion.difficulty === "Extreme"
                  ? styles.difficultyExtreme
                  : styles.difficultyHard
              }`}
            >
              {currentQuestion.difficulty} Difficulty
            </span>
            {currentQuestion.topic && (
              <span className={styles.questionBadge}>
                {currentQuestion.topic}
              </span>
            )}
          </div>

          <button
            type="button"
            className={`${styles.flagButton} ${
              isCurrentFlagged ? styles.flagButtonActive : ""
            }`}
            onClick={handleToggleFlag}
            aria-pressed={isCurrentFlagged}
          >
            <Icon name="star" size={16} />
            <span>{isCurrentFlagged ? "Flagged" : "Flag Trap"}</span>
          </button>
        </div>

        <h1 className={styles.questionText}>{currentQuestion.question}</h1>

        {/* Options List */}
        <div className={styles.optionsGroup} role="radiogroup" aria-label="Answers">
          {currentQuestion.options.map((optText, optIdx) => {
            const isSelected = selectedOptionIndex === optIdx;
            const letters = ["A", "B", "C", "D"];

            return (
              <button
                key={optIdx}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.optionCard} ${
                  isSelected ? styles.optionCardSelected : ""
                }`}
                onClick={() => handleSelectOption(optIdx)}
              >
                <span className={styles.optionBadge}>{letters[optIdx]}</span>
                <span>{optText}</span>
              </button>
            );
          })}
        </div>

        {/* Confidence Tagging Section */}
        <div className={styles.confidenceSection}>
          <span className={styles.confidenceLabel}>Confidence Tag:</span>
          <div className={styles.confidenceButtons}>
            <button
              type="button"
              className={`${styles.confidenceBtn} ${
                currentConfidence === "high" ? styles.confidenceBtnActive : ""
              }`}
              onClick={() => handleSetConfidence("high")}
            >
              <span>🟢 High Confidence</span>
            </button>

            <button
              type="button"
              className={`${styles.confidenceBtn} ${
                currentConfidence === "tricky" ? styles.confidenceBtnActive : ""
              }`}
              onClick={() => handleSetConfidence("tricky")}
            >
              <span>🟡 Suspicious Trap</span>
            </button>

            <button
              type="button"
              className={`${styles.confidenceBtn} ${
                currentConfidence === "guess" ? styles.confidenceBtnActive : ""
              }`}
              onClick={() => handleSetConfidence("guess")}
            >
              <span>🔴 Pure Guess</span>
            </button>
          </div>
        </div>

        {/* Adversarial Mindset Clue Drawer */}
        {currentQuestion.hint && (
          <div>
            <button
              type="button"
              className={styles.hintToggle}
              onClick={() => setShowHint((h) => !h)}
            >
              <Icon name="brain" size={16} />
              <span>
                {showHint
                  ? "Hide Professor's Mindset Hint"
                  : "💡 Reveal Professor's Mindset Hint"}
              </span>
            </button>

            {showHint && (
              <div className={styles.hintDrawer} style={{ marginTop: "var(--s-2)" }}>
                <strong>Adversarial Clue: </strong>
                <span>{currentQuestion.hint}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navigation Footer */}
      <footer className={styles.actionsBar}>
        <Button
          variant="secondary"
          disabled={currentIndex === 0}
          onClick={() => {
            setCurrentIndex((i) => Math.max(0, i - 1));
            setShowHint(false);
          }}
        >
          Previous Question
        </Button>

        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          {currentIndex < questions.length - 1 ? (
            <Button
              variant="primary"
              onClick={() => {
                setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                setShowHint(false);
              }}
            >
              Next Question
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Calculating Radar..." : "Submit Gauntlet & View Radar"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
