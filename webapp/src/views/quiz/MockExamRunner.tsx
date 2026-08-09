import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../context/toast";
import { useDialog } from "../../context/dialog";
import { useQuiz, useRecordQuizAttempt } from "../../hooks/useQuizzes";
import { useExamProctor } from "../../hooks/useExamProctor";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useQuizDraft } from "../../hooks/useQuizDraft";
import { useSettings } from "../../context/settings";
import { Storage } from "../../lib/storage";
import type { QuizQuestion } from "../../lib/aiJson";
import {
  parseStoredQuestions,
  weakTopicsFrom,
  type StoredAnswer,
} from "./quizMeta";
import styles from "./quiz.module.css";
import { QUIZZES_PATH } from "./QuizRunner";

interface ExamDraftState {
  index: number;
  answers: StoredAnswer[];
  /** Absolute epoch ms the exam ends at — see the comment where this is
   *  computed in MockExamSession for why it's a timestamp, not a duration. */
  examEndAt: number;
}

function isUsableExamDraft(
  draft: ExamDraftState | null,
  questionCount: number,
): draft is ExamDraftState {
  return (
    !!draft &&
    typeof draft.index === "number" &&
    draft.index >= 0 &&
    draft.index < questionCount &&
    Array.isArray(draft.answers) &&
    typeof draft.examEndAt === "number"
  );
}

export function MockExamRunner() {
  const { quizId = "" } = useParams();
  const { data: quiz, isPending, isError } = useQuiz(quizId);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  /* Only listens for *entering* fullscreen here. Leaving mid-exam is a
     proctoring event (terminate + record what's been answered so far), but
     that requires the answers/score living in MockExamSession below — so
     the exit side of this lives there instead, scoped to `!finished`. That
     scoping also means alt-tabbing on this landing screen (before the exam
     has started) or after finishing (while looking at the score, before
     clicking "Review Answers") is never mistaken for leaving mid-exam. */
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) setIsFullscreen(true);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const enterFullscreen = () => {
    if (!containerRef.current) return;
    if (typeof containerRef.current.requestFullscreen !== "function") {
      /* The Fullscreen API doesn't exist at all on some browsers (notably
         iOS Safari) — calling it would throw synchronously, not reject a
         promise, so it can't be caught below. Fall back to the exam
         without fullscreen rather than crashing the page; the tab-switch
         guard in MockExamSession still enforces staying on the page. */
      showToast(
        "Fullscreen isn't supported on this device — starting without it. Switching tabs will still end the exam.",
      );
      setIsFullscreen(true);
      return;
    }
    containerRef.current.requestFullscreen().catch(() => {
      showToast("Failed to enter fullscreen.", { error: true });
    });
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
  const { confirm } = useDialog();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const draftKey = `learnora_exam_draft_${quizId}`;

  /* A refresh mid-exam drops `isFullscreen` in the parent, so the student
     always lands back on the "Begin Mock Exam" gate first — re-entering
     fullscreen is itself the resume gesture, so unlike QuizRunner this
     resumes silently rather than asking. A stale/corrupt/out-of-range draft
     is treated as no draft. */
  const [resumedDraft] = useState(() => {
    const stored = Storage.get<ExamDraftState>(draftKey);
    return isUsableExamDraft(stored, questions.length) ? stored : null;
  });

  const [index, setIndex] = useState(() => resumedDraft?.index ?? 0);
  const [answers, setAnswers] = useState<StoredAnswer[]>(
    () => resumedDraft?.answers ?? [],
  );
  /* Fixed for the life of the session (not recomputed as time ticks) — the
     wall-clock target the countdown works backward from. A raw persisted
     countdown would let a refresh "bank" time (or unfairly lose it) relative
     to whatever's actually left; anchoring to an absolute timestamp instead
     makes a refresh time-neutral, which is the actual correctness
     requirement for a timed exam. */
  const [examEndAt] = useState(
    () => resumedDraft?.examEndAt ?? Date.now() + questions.length * 60_000,
  );
  const [timeLeft, setTimeLeft] = useState(() =>
    resumedDraft
      ? Math.max(0, Math.round((examEndAt - Date.now()) / 1000))
      : questions.length * 60,
  );

  const finished = index >= questions.length || timeLeft <= 0;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  /* submitExam (early exit / proctoring termination) records and navigates
     away without ever flipping `index`/`timeLeft` into the "finished" shape
     — so `finished` alone doesn't reliably disable autosave for that path.
     Without this, a re-render landing between submitExam's draft.clear()
     and the component actually unmounting (e.g. the toast it shows causes
     one) would see `enabled` still true and re-arm the debounced write,
     silently resurrecting the draft right after it was cleared. A ref
     (not state) is enough — it only needs to be correct by the time some
     *other* render reads it, not to cause one itself. */
  const submittedRef = useRef(false);

  const draft = useQuizDraft<ExamDraftState>(
    draftKey,
    { index, answers, examEndAt },
    {
      enabled: !finished && !submittedRef.current,
      warnOnUnload:
        !finished && !submittedRef.current && answers.length > 0,
    },
  );

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
    draft.clear();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, quizId, score, total, answers, record, showToast]);

  /* The proctoring guard: leaving fullscreen or switching tabs ends the
     exam. Scoped to `!finished` so it can never fire once every question is
     answered (or time is up) — including the moment between finishing and
     clicking "Review Answers", when exiting fullscreen is the *expected*
     next step, not a violation.

     Unlike a plain kick-out, this still records whatever was answered
     before the interruption (same shape as the natural-finish effect
     above) rather than silently discarding it — leaving early costs the
     rest of the exam, not the part already done.

     If settings.examTerminationGrace is enabled, shows a countdown warning
     before terminating (see useExamProctor). */
  const submitExam = (reason: "terminated" | "voluntary") => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    // Bypasses the `finished`-triggered effect above (index/timeLeft never
    // actually cross the finished threshold on this path), so the draft
    // needs clearing here too — and autosave needs to stay off from here
    // on, or a re-render before the component unmounts (e.g. the toast
    // below) would re-arm it. See submittedRef's declaration for why.
    submittedRef.current = true;
    draft.clear();
    record(
      { quizId, score, total, answers, weakTopics: weakTopicsFrom(answers) },
      {
        onError: () =>
          showToast("Failed to save exam attempt.", { error: true }),
      },
    );
    if (reason === "terminated") {
      showToast("Mock Exam terminated!", { error: true });
    } else {
      showToast("Mock Exam submitted.");
    }
    navigate(QUIZZES_PATH);
  };

  const { graceCountdown, graceReason } = useExamProctor({
    isActive: !finished,
    enabled: settings.examTerminationGrace,
    onTerminate: () => {
      submitExam("terminated");
    },
  });

  /* `question` is undefined once `finished` (index runs past the end) — fine,
     since `choose` below is only ever invoked from the keyboard-shortcut
     handlers or the choice buttons, both gated off once finished. */
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

  /* Keyboard shortcuts: 1-4 or A-D to choose answer (auto-advances).
   *
   * Must be called unconditionally on every render — it sits above the
   * `if (finished)` early return below so the hook order never changes
   * between renders (a hook call after a conditional return violates the
   * Rules of Hooks: React throws "Rendered fewer hooks than expected" the
   * moment `finished` flips true). `enabled: !finished` is what actually
   * turns the shortcuts off once the exam ends, not the early return. */
  useKeyboardShortcuts(
    {
      "1": () => choose(0),
      "2": () => choose(1),
      "3": () => choose(2),
      "4": () => choose(3),
      "a": () => choose(0),
      "b": () => choose(1),
      "c": () => choose(2),
      "d": () => choose(3),
    },
    { enabled: !finished },
  );

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

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const isStressful = timeLeft < 30;

  const endExamEarly = async () => {
    const ok = await confirm(
      "Are you sure you want to end the exam now? Your answers so far will be recorded, but you won't get points for unanswered questions.",
      { title: "End Exam Early?", confirmText: "End Exam", danger: true },
    );
    if (ok) {
      submitExam("voluntary");
    }
  };

  return (
    <>
      {graceCountdown !== null && (
        // role="alert" (an assertive live region) so screen-reader users get
        // the same interruption sighted students get from the banner
        // appearing — without it, this warning was silent for them even
        // though the exam clock keeps running either way.
        <div role="alert" className={styles.graceBanner}>
          <p>
            {graceReason === "fullscreen"
              ? "You exited fullscreen!"
              : "You left the exam tab!"}
          </p>
          <p>
            Returning to the exam in {Math.ceil(graceCountdown / 1000)}s or it will be submitted.
          </p>
        </div>
      )}
      <Card variant="panel" padding="lg" className={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className={styles.progress}>Question {index + 1} of {questions.length}</p>
          <p className={isStressful ? styles.timeLeftUrgent : styles.timeLeft}>
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

        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
          <Button variant="secondary" onClick={endExamEarly}>
            End Exam Early
          </Button>
        </div>
      </Card>
    </>
  );
}
