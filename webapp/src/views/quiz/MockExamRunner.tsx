import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../context/toast";
import { useQuiz, useRecordQuizAttempt } from "../../hooks/useQuizzes";
import type { QuizQuestion } from "../../lib/aiJson";
import {
  parseStoredQuestions,
  weakTopicsFrom,
  type StoredAnswer,
} from "./quizMeta";
import styles from "./quiz.module.css";
import { QUIZZES_PATH } from "./QuizRunner";

export function MockExamRunner() {
  const { quizId = "" } = useParams();
  const { data: quiz, isPending, isError } = useQuiz(quizId);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        showToast("Mock Exam terminated! You exited fullscreen.", { error: true });
        navigate(QUIZZES_PATH);
      } else {
        setIsFullscreen(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Auto-fail the exam if they switch tabs
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        setIsFullscreen(false);
        showToast("Mock Exam terminated! You left the exam tab.", { error: true });
        navigate(QUIZZES_PATH);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [navigate, showToast]);

  const enterFullscreen = () => {
    if (containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {
        showToast("Failed to enter fullscreen.", { error: true });
      });
    }
  };

  if (isPending) {
    return <div className={styles.view} aria-busy="true">Loading exam...</div>;
  }

  if (isError || !quiz) {
    return (
      <div className={styles.view}>
        <Link to={QUIZZES_PATH} className={styles.exit}>← Exit</Link>
        <h1>Could not load exam.</h1>
      </div>
    );
  }

  const questions = parseStoredQuestions(quiz.questions_json);
  if (questions.length === 0) {
    return (
      <div className={styles.view}>
        <Link to={QUIZZES_PATH} className={styles.exit}>← Exit</Link>
        <h1>{quiz.title}</h1>
        <p>This exam has no questions.</p>
      </div>
    );
  }

  if (!isFullscreen) {
    return (
      <div className={styles.view} ref={containerRef}>
        <Card variant="panel" padding="lg">
          <h1>Mock Exam: {quiz.title}</h1>
          <p>This is a strict mock exam. You must remain in fullscreen mode. If you exit fullscreen, your exam will be terminated.</p>
          <Button variant="danger" onClick={enterFullscreen}>
            Begin Mock Exam (Fullscreen)
          </Button>
          <div style={{ marginTop: 16 }}>
            <Link to={QUIZZES_PATH} className={styles.exit}>Cancel</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.view} ref={containerRef} style={{ background: "var(--bg)", height: "100vh", overflowY: "auto" }}>
      <MockExamSession quizId={quiz.id} questions={questions} />
    </div>
  );
}

function MockExamSession({
  quizId,
  questions,
}: {
  quizId: string;
  questions: QuizQuestion[];
}) {
  const recordAttempt = useRecordQuizAttempt();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(questions.length * 60); // 1 minute per question

  const finished = index >= questions.length || timeLeft <= 0;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [finished]);

  const { mutate: record } = recordAttempt;
  useEffect(() => {
    if (!finished) return;
    record(
      {
        quizId,
        score,
        total,
        answers,
        weakTopics: weakTopicsFrom(answers),
      },
      {
        onError: () =>
          showToast("Failed to save exam attempt.", { error: true }),
      },
    );
  }, [finished, quizId, score, total, answers, record, showToast]);

  if (finished) {
    const exitExam = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
      navigate(`/quiz/${quizId}/review`);
    };

    return (
      <Card variant="panel" padding="lg" className={styles.panel}>
        <h1>Exam Complete!</h1>
        <p className={styles.score}>{score} / {total} correct</p>
        {timeLeft <= 0 && <p className={styles.muted}>Time's up!</p>}
        <Button variant="primary" onClick={exitExam}>Review Answers</Button>
      </Card>
    );
  }

  const question = questions[index];

  const choose = (chosenIndex: number) => {
    const correct = chosenIndex === question.correctIndex;
    setAnswers((prev) => [
      ...prev,
      {
        questionId: question.id ?? index,
        chosenIndex,
        correct,
        topic: question.topic,
      },
    ]);
    setIndex((i) => i + 1);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const isStressful = timeLeft < 30;

  return (
    <Card variant="panel" padding="lg" className={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className={styles.progress}>Question {index + 1} of {questions.length}</p>
        <p 
          style={{ 
            fontWeight: "bold", 
            color: isStressful ? "var(--accent-red)" : "inherit",
            animation: isStressful ? "pulse 1s infinite" : "none"
          }}
        >
          Time Left: {minutes}:{seconds.toString().padStart(2, "0")}
        </p>
      </div>
      <h1 className={styles.question}>{question.question}</h1>

      <div className={styles.choices}>
        {question.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            className={styles.choice}
            onClick={() => choose(i)}
          >
            {choice}
          </button>
        ))}
      </div>
    </Card>
  );
}
