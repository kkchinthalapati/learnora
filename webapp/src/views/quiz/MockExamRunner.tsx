import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../context/toast";
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
import { renderMathText } from "../../lib/markdownToReact";
import { QUIZZES_PATH } from "./QuizRunner";
import { newAttemptKey } from "../../lib/attemptKey";
import { examDraftKey } from "../../lib/draftKeys";
import { useStudyClock } from "../../hooks/useStudyClock";
import { useOnlineStatus } from "../../lib/offlineSync";
import { OfflineTestBar } from "../../components/OfflineBanner";
import { ConfidencePicker } from "../../components/learning/ConfidencePicker";
import type { Confidence } from "../../components/learning/options";
import { TestResults } from "./TestResults";
import text from "../../styles/text.module.css";
import runner from "./testRunner.module.css";

interface ExamDraftState {
  index: number;
  answers: StoredAnswer[];
  /** Absolute epoch ms the exam ends at — see the comment where this is
   *  computed in MockExamSession for why it's a timestamp, not a duration. */
  examEndAt: number;
  /** Identifies this sitting, so recording it twice writes one attempt.
   *  Optional so a draft written by an older build still resumes. */
  attemptKey?: string;
  /** Questions flagged for review, by index. */
  flagged?: number[];
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
      /* The API exists but the browser said no (a setting, an embedded
         view). This used to leave the student on the start screen with
         "Failed to enter fullscreen" and no way to sit the exam at all. Same
         fallback as a device without the API. */
      showToast(
        "Your browser wouldn't go fullscreen — starting without it. Switching tabs will still end the exam.",
      );
      setIsFullscreen(true);
    });
  };

  if (isPending) {
    return <div className={styles.view} aria-busy="true">Loading exam...</div>;
  }

  if (isError || !quiz) {
    return (
      <div className={styles.view}>
        <Link to={QUIZZES_PATH} className={styles.exit}>← Exit</Link>
        <h2>Could not load exam.</h2>
      </div>
    );
  }

  const questions = parseStoredQuestions(quiz.questions_json);
  if (questions.length === 0) {
    return (
      <div className={styles.view}>
        <Link to={QUIZZES_PATH} className={styles.exit}>← Exit</Link>
        <h2>{quiz.title}</h2>
        <p>This exam has no questions.</p>
      </div>
    );
  }

  if (!isFullscreen) {
    return (
      <div className={styles.view} ref={containerRef}>
        <Card variant="panel" padding="lg">
          <h2>Mock Exam: {quiz.title}</h2>
          <p>
            {typeof document !== "undefined" && document.fullscreenEnabled
              ? "This is a strict mock exam. It runs fullscreen; leaving fullscreen or switching tabs ends it."
              : "This is a strict mock exam. Your device can't go fullscreen, so it runs in this tab; switching tabs or apps ends it."}
          </p>
          <Button variant="danger" onClick={enterFullscreen}>
            {typeof document !== "undefined" && document.fullscreenEnabled
              ? "Begin Mock Exam (Fullscreen)"
              : "Begin Mock Exam"}
          </Button>
          <div style={{ marginTop: 16 }}>
            <Link to={QUIZZES_PATH} className={styles.exit}>Cancel</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={runner.frame} ref={containerRef}>
      <MockExamSession
        quizId={quiz.id}
        quizTitle={quiz.title || "Mock Exam"}
        folderId={quiz.folder_id}
        questions={questions}
      />
    </div>
  );
}

function MockExamSession({
  quizId,
  quizTitle,
  folderId,
  questions,
}: {
  quizId: string;
  quizTitle: string;
  folderId: string | null;
  questions: QuizQuestion[];
}) {
  const recordAttempt = useRecordQuizAttempt();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { isOnline } = useOnlineStatus();
  /* This screen doesn't time its questions, so the clock is marked per
     answer instead of fed pre-measured durations. */
  const studyClock = useStudyClock({
    timerType: "quiz",
    task: quizTitle,
    folderId,
  });

  useEffect(() => {
    studyClock.mark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftKey = examDraftKey(quizId);

  /* A refresh mid-exam drops `isFullscreen` in the parent, so the student
     lands back on the "Begin" gate first — re-entering fullscreen is itself
     the resume gesture, so this resumes silently. A stale/corrupt draft is
     treated as no draft. */
  const [resumedDraft] = useState(() => {
    const stored = Storage.get<ExamDraftState>(draftKey);
    return isUsableExamDraft(stored, questions.length) ? stored : null;
  });

  const [index, setIndex] = useState(() => resumedDraft?.index ?? 0);
  /* One stored answer per answered question, replaced when the student
     changes their mind — the test is navigable now, not auto-advancing. */
  const [answers, setAnswers] = useState<StoredAnswer[]>(
    () => resumedDraft?.answers ?? [],
  );
  const [flagged, setFlagged] = useState<number[]>(
    () => resumedDraft?.flagged ?? [],
  );
  /* Fixed for the life of the session — the wall-clock target the countdown
     works back from, so a refresh is time-neutral. */
  const [examEndAt] = useState(
    () => resumedDraft?.examEndAt ?? Date.now() + questions.length * 60_000,
  );
  const [timeLeft, setTimeLeft] = useState(() =>
    resumedDraft
      ? Math.max(0, Math.round((examEndAt - Date.now()) / 1000))
      : questions.length * 60,
  );
  const [hideTimer, setHideTimer] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  /* "Submit test…" with blanks lists them inline rather than in a modal. */
  const [reviewingBlanks, setReviewingBlanks] = useState(false);

  /* One key for the sitting, carried in the draft. Two record paths exist —
     the finished effect and a proctoring termination — and the same key on
     both makes the second a no-op. */
  const [attemptKey] = useState(
    () => resumedDraft?.attemptKey ?? newAttemptKey(),
  );

  const timeUp = timeLeft <= 0;
  const finished = submitted || timeUp;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  /* A termination records and navigates away without flipping `finished`;
     this keeps autosave from resurrecting the draft it just cleared. */
  const submittedRef = useRef(false);

  const draft = useQuizDraft<ExamDraftState>(
    draftKey,
    { index, answers, examEndAt, attemptKey, flagged },
    {
      enabled: !finished && !submittedRef.current,
      warnOnUnload: !finished && !submittedRef.current && answers.length > 0,
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
    if (!finished || submittedRef.current) return;
    submittedRef.current = true;
    draft.clear();
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    record(
      {
        quizId,
        score,
        total,
        answers,
        weakTopics: weakTopicsFrom(answers),
        attemptKey,
      },
      {
        onError: () =>
          showToast(
            "Your result is shown here, but saving the attempt failed. It is kept on this device and will retry.",
            { error: true },
          ),
      },
    );
    studyClock.commit();
    // Runs on the transition into "finished" only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* Leaving fullscreen or switching tabs ends a strict mock exam. What was
     answered is still recorded — leaving early costs the rest of the exam,
     not the part already done. */
  const terminate = (proctorReason: "fullscreen" | "visibility") => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    submittedRef.current = true;
    draft.clear();
    record(
      {
        quizId,
        score,
        total,
        answers: {
          items: answers,
          proctorTermination: {
            reason: proctorReason,
            timestamp: new Date().toISOString(),
          },
        },
        weakTopics: weakTopicsFrom(answers),
        attemptKey,
      },
      {
        onError: () =>
          showToast("Failed to save exam attempt.", { error: true }),
      },
    );
    studyClock.commit();
    showToast(
      proctorReason === "fullscreen"
        ? "Mock exam ended: you left fullscreen. Your answers so far are saved."
        : "Mock exam ended: you left the exam tab. Your answers so far are saved.",
      { error: true },
    );
    navigate(`/quiz/${quizId}/review`);
  };

  const { graceCountdown, graceReason } = useExamProctor({
    isActive: !finished,
    enabled: settings.examTerminationGrace,
    onTerminate: terminate,
  });

  const question = questions[index];
  const answerFor = (i: number) =>
    answers.find((a) => a.questionId === (questions[i]?.id ?? i));
  const current = answerFor(index);
  const unanswered = questions
    .map((_, i) => i)
    .filter((i) => !answerFor(i));

  const choose = (chosenIndex: number) => {
    if (finished || !question) return;
    studyClock.mark();
    const key = question.id ?? index;
    setAnswers((prev) => {
      const entry: StoredAnswer = {
        questionId: key,
        chosenIndex,
        correct: chosenIndex === question.correctIndex,
        topic: question.topic,
        confidence: prev.find((a) => a.questionId === key)?.confidence ?? null,
      };
      const at = prev.findIndex((a) => a.questionId === key);
      if (at === -1) return [...prev, entry];
      const next = [...prev];
      next[at] = entry;
      return next;
    });
  };

  const rate = (confidence: Confidence | null) => {
    const key = question?.id ?? index;
    setAnswers((prev) =>
      prev.map((a) => (a.questionId === key ? { ...a, confidence } : a)),
    );
  };

  const go = (i: number) => {
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
  };

  const toggleFlag = () =>
    setFlagged((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );

  const submit = () => {
    if (!isOnline) return;
    if (unanswered.length > 0 && !reviewingBlanks) {
      setReviewingBlanks(true);
      return;
    }
    setSubmitted(true);
  };

  /* A–D (or 1–4) select, ←/→ move, F flags. */
  useKeyboardShortcuts(
    {
      "1": () => choose(0),
      "2": () => choose(1),
      "3": () => choose(2),
      "4": () => choose(3),
      a: () => choose(0),
      b: () => choose(1),
      c: () => choose(2),
      d: () => choose(3),
      ArrowLeft: () => go(index - 1),
      ArrowRight: () => go(index + 1),
      f: toggleFlag,
    },
    { enabled: !finished },
  );

  if (finished) {
    return (
      <TestResults
        quizId={quizId}
        title={quizTitle}
        questions={questions}
        answers={answers}
        note={timeUp && !submitted ? "Time's up. Everything you answered was submitted." : undefined}
      />
    );
  }

  const minutes = Math.floor(Math.max(0, timeLeft) / 60);
  const seconds = Math.max(0, timeLeft) % 60;
  const urgent = timeLeft < 60;
  const answeredCount = questions.length - unanswered.length;

  return (
    <div className={runner.runner}>
      <OfflineTestBar />
      {graceCountdown !== null && (
        <div role="alert" className={styles.graceBanner}>
          <p>
            {graceReason === "fullscreen"
              ? "You exited fullscreen!"
              : "You left the exam tab!"}
          </p>
          <p>
            Auto-submitting in <strong>{Math.ceil(graceCountdown / 1000)}s</strong> unless you return.
          </p>
          {graceReason === "fullscreen" ? (
            <div className={styles.graceAction}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                }}
              >
                Return to fullscreen
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <header className={runner.topbar}>
        <div className={runner.titleBlock}>
          <h1 className={runner.title}>{quizTitle}</h1>
          <span className={runner.sub}>
            {questions.length} questions · closed book
          </span>
        </div>
        <div className={runner.topRight}>
          {hideTimer ? null : (
            <span
              className={runner.timer}
              data-urgent={urgent || undefined}
              role="timer"
              aria-label={`Time left: ${minutes} minutes ${seconds} seconds`}
            >
              {minutes}:{seconds.toString().padStart(2, "0")} left
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={() => setHideTimer((h) => !h)}>
            {hideTimer ? "Show timer" : "Hide timer"}
          </Button>
        </div>
      </header>

      <nav className={runner.navigator} aria-label="Questions">
        <ol className={runner.squares}>
          {questions.map((_, i) => {
            const isAnswered = Boolean(answerFor(i));
            const isFlagged = flagged.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  className={runner.square}
                  data-answered={isAnswered || undefined}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => go(i)}
                  aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", not answered"}${isFlagged ? ", flagged" : ""}`}
                >
                  {i + 1}
                  {isFlagged ? <span className={runner.flagDot} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <span className={runner.summary}>
          {answeredCount} answered · {flagged.length} flagged · {unanswered.length} to go
        </span>
      </nav>

      <main className={runner.body}>
        <div className={runner.column}>
          <div className={runner.metaRow}>
            <span className={text.meta}>
              Question {index + 1} of {questions.length}
            </span>
            <button
              type="button"
              className={runner.flagBtn}
              aria-pressed={flagged.includes(index)}
              onClick={toggleFlag}
            >
              {flagged.includes(index) ? "Flagged for review" : "Flag for review"}
            </button>
          </div>
          <h2 className={runner.stem}>{renderMathText(question.question)}</h2>
          <ul className={runner.options} aria-label="Choices">
            {question.choices.map((choice, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={runner.option}
                  aria-pressed={current?.chosenIndex === i}
                  onClick={() => choose(i)}
                >
                  <span className={runner.key} aria-hidden="true">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{renderMathText(choice)}</span>
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <ConfidencePicker value={current.confidence ?? null} onChange={rate} />
          ) : null}

          {reviewingBlanks && unanswered.length > 0 ? (
            <section className={runner.blanks} aria-labelledby="blanks-title">
              <p id="blanks-title" className={runner.blanksTitle}>
                {unanswered.length} {unanswered.length === 1 ? "question is" : "questions are"} still blank
              </p>
              <ul className={runner.blankList}>
                {unanswered.map((i) => (
                  <li key={i}>
                    <button type="button" className={runner.blankLink} onClick={() => go(i)}>
                      Question {i + 1}
                    </button>
                  </li>
                ))}
              </ul>
              <div className={runner.blankActions}>
                <Button variant="secondary" size="sm" onClick={() => setSubmitted(true)} disabled={!isOnline}>
                  Submit anyway
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setReviewingBlanks(false)}>
                  Keep going
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <footer className={runner.footer}>
        <div className={runner.footLeft}>
          <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
            ← Previous
          </Button>
          <span className={runner.saved}>Saved on this device and in your account</span>
        </div>
        <div className={runner.footRight}>
          <Button variant="ghost" onClick={submit} disabled={!isOnline}>
            Submit test…
          </Button>
          {index < questions.length - 1 ? (
            <Button variant="primary" onClick={() => go(index + 1)}>
              Next →
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!isOnline}>
              Submit test
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
