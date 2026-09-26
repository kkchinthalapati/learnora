import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";
import { useDialog } from "../../context/dialog";
import { useOptionalChat } from "../../context/chat";
import { useContinuity } from "../../hooks/useContinuity";
import { useQuiz, useRecordQuizAttempt } from "../../hooks/useQuizzes";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useQuizDraft } from "../../hooks/useQuizDraft";
import { Storage } from "../../lib/storage";
import type { QuizQuestion } from "../../lib/aiJson";
import {
  hostFeedback,
  parseStoredQuestions,
  weakTopicsFrom,
  type StoredAnswer,
} from "./quizMeta";
import { QuizHost, type HostTone } from "./QuizHost";
import { useStudyClock } from "../../hooks/useStudyClock";
import styles from "./quiz.module.css";
import { newAttemptKey } from "../../lib/attemptKey";
import { quizDraftKey } from "../../lib/draftKeys";
import { clearQuizProgress } from "../../lib/continuity";

/* The quiz runner — ports js/router.js's `startQuiz` (:827-945).
 *
 * The vanilla rebuilt `#quiz-content` per question with `innerHTML` and then
 * attached a listener per choice, remembering to `esc()` each string on the
 * way in. Here the question is state and JSX escapes by construction, so the
 * whole re-render/re-bind cycle and every `esc()` call disappear.
 *
 * `questions_json` is narrowed once through `parseStoredQuestions` (see
 * quizMeta.ts) rather than trusted — a stored question whose `correctIndex`
 * is out of range would otherwise mark every answer, including the right one,
 * wrong, and say nothing about it.
 *
 * Split in two so the session's hooks never sit behind a loading branch: the
 * route component resolves the quiz, `QuizSession` runs it. */

export const QUIZZES_PATH = "/library/quizzes";

export function ExitLink() {
  return (
    <Link to={QUIZZES_PATH} className={styles.exit}>
      ← Exit
    </Link>
  );
}

export function QuizRunner() {
  const { quizId = "" } = useParams();
  const { data: quiz, isPending, isError, error } = useQuiz(quizId);
  const [sitting, setSitting] = useState(0);

  if (isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading quiz" height={220} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load this quiz. {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!quiz) {
    /* Was a bare "Quiz not found." with no way forward but the browser's back
       button. A stale link or a quiz deleted on another device is an ordinary
       thing to hit, and the rest of the app already answers it properly — the
       notebook and the deck screens both say what probably happened and offer
       the list to go back to. */
    return (
      <div className={styles.view}>
        <ExitLink />
        <EmptyState
          icon="alert-circle"
          title="Quiz not found"
          message="It may have been deleted, or the link is out of date."
        >
          <Link to={QUIZZES_PATH}>
            <Button variant="primary">Back to Quizzes</Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  const questions = parseStoredQuestions(quiz.questions_json);

  /* Every question was unusable (or there were none). The vanilla would have
     rendered "Question 1 of 0" and an empty choice list. */
  if (questions.length === 0) {
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <ExitLink />
          <h2>{quiz.title || "Quiz"}</h2>
          <p className={styles.muted}>
            This quiz has no usable questions. Generating it again should fix
            it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <QuizSession
      quizId={quiz.id}
      quizTitle={quiz.title || "Quiz"}
      folderId={quiz.folder_id}
      questions={questions}
      onRetake={() => setSitting((n) => n + 1)}
      /* A fresh quiz is a fresh run: keying on the id resets index, answers
         and the recorded flag when the route changes between two quizzes.
         The sitting counter does the same for "Retake quiz" — a remount is
         what gives the retake its own attempt key and its own study-clock
         commit, which latches once per mount. */
      key={`${quiz.id}:${sitting}`}
    />
  );
}

interface Answered {
  chosenIndex: number;
  correct: boolean;
}

interface QuizDraftState {
  index: number;
  answers: StoredAnswer[];
  /** Identifies this run, so finishing it twice — a resumed draft, a
   *  duplicated tab, a replayed mutation — records one attempt. Optional so a
   *  draft written by an older build still resumes. */
  attemptKey?: string;
}

function isUsableDraft(
  draft: QuizDraftState | null,
  questionCount: number,
): draft is QuizDraftState {
  return (
    !!draft &&
    typeof draft.index === "number" &&
    draft.index >= 0 &&
    draft.index < questionCount &&
    Array.isArray(draft.answers) &&
    /* A draft with nothing answered is not progress. The draft is written
       the moment the quiz mounts, so opening a quiz and leaving meant the
       next visit opened on "Resume quiz? (question 1 of 2)" — a dialog
       about an attempt the student never started. */
    draft.answers.length > 0
  );
}

function QuizSession({
  quizId,
  quizTitle,
  folderId,
  questions,
  onRetake,
}: {
  quizId: string;
  quizTitle: string;
  folderId: string | null;
  questions: QuizQuestion[];
  onRetake: () => void;
}) {
  const recordAttempt = useRecordQuizAttempt();
  const { showToast } = useToast();
  /* No marking needed: `choose` below already stamps `secondsSpent` into every
     stored answer, which is the same measurement the clock wants. */
  const studyClock = useStudyClock({
    timerType: "quiz",
    task: quizTitle,
    folderId,
  });
  const { confirm } = useDialog();
  const chat = useOptionalChat();
  const { recordQuiz } = useContinuity();

  const draftKey = quizDraftKey(quizId);

  /* A stale/corrupt/out-of-range draft (e.g. the quiz was regenerated with
     fewer questions since the draft was written) is treated as no draft at
     all, rather than crashing or landing on a bad index. */
  const [resumedDraft] = useState(() => {
    const stored = Storage.get<QuizDraftState>(draftKey);
    return isUsableDraft(stored, questions.length) ? stored : null;
  });

  const [index, setIndex] = useState(() => resumedDraft?.index ?? 0);
  const [answers, setAnswers] = useState<StoredAnswer[]>(
    () => resumedDraft?.answers ?? [],
  );
  /* Resuming onto a question the draft already holds an answer for (the
     student answered, saw the verdict, then refreshed before pressing Next)
     restores that verdict instead of offering the question fresh. Offering
     it fresh let a refresh turn a revealed wrong answer into a right one,
     and that inflated score feeds readiness and the grade forecast. */
  const [answered, setAnswered] = useState<Answered | null>(() => {
    if (!resumedDraft) return null;
    const question = questions[resumedDraft.index];
    const prior = resumedDraft.answers.find(
      (a) => a.questionId === (question?.id ?? resumedDraft.index),
    );
    return prior
      ? { chosenIndex: prior.chosenIndex, correct: prior.correct }
      : null;
  });

  /* Minted once per run and carried in the draft, so resuming keeps the same
     key while "Start Over" below mints a fresh one — a genuine second sitting
     is a second attempt and should count as one. */
  const [attemptKey, setAttemptKey] = useState(
    () => resumedDraft?.attemptKey ?? newAttemptKey(),
  );

  /* When the current question went on screen — choose() stamps the elapsed
   * seconds into the stored answer, which is the Speed Demon achievement's
   * speed signal (achievements.ts consumes it via fastQuizCompleted). */
  const questionShownAt = useRef(Date.now());
  useEffect(() => {
    questionShownAt.current = Date.now();
  }, [index]);

  const finished = index >= questions.length;
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;

  const draft = useQuizDraft<QuizDraftState>(
    draftKey,
    { index, answers, attemptKey },
    { enabled: !finished, warnOnUnload: !finished && answers.length > 0 },
  );

  /* Ask once, on mount, whether to keep the optimistically-resumed state or
     start fresh — rather than blocking the first render on the dialog, which
     would mean showing nothing (or a spinner) while it's up. Declining
     resets back to question 1 and drops the draft; confirming just leaves
     the already-resumed state in place. */
  useEffect(() => {
    if (!resumedDraft) return;
    let cancelled = false;
    void confirm(
      `You have an in-progress attempt at this quiz (question ${
        resumedDraft.index + 1
      } of ${questions.length}). Resume where you left off?`,
      { title: "Resume quiz?", confirmText: "Resume", cancelText: "Start Over" },
    ).then((keep) => {
      if (cancelled || keep) return;
      setIndex(0);
      setAnswers([]);
      setAnswered(null);
      setAttemptKey(newAttemptKey());
      draft.clear();
    });
    return () => {
      cancelled = true;
    };
    // Mount-only: this is a one-time prompt about the draft that was present
    // when the component first mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Feed the dashboard's "Resume Learning" card: the quiz currently in
   * progress, with the question position, becomes the pick-up-where-you-left-off
   * candidate until another activity replaces it. (The localStorage quiz draft
   * above already survives the gap on its own; this surfaces it on the
   * dashboard too.) */
  useEffect(() => {
    if (finished) return;
    recordQuiz({
      id: quizId,
      title: quizTitle,
      questionIndex: index,
      totalQuestions: questions.length,
    });
  }, [finished, index, questions.length, quizId, quizTitle, recordQuiz]);

  /* The attempt is written once, when the run ends. Fire-and-forget on
     purpose: the student already finished, so the completion screen must not
     wait on the network — but a failure is surfaced, because weak-topic
     tracking silently stops working otherwise (js/router.js:867-875). */
  const { mutate: record } = recordAttempt;
  useEffect(() => {
    if (!finished) return;
    draft.clear();
    clearQuizProgress(quizId);
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
            "Your score is shown above, but we couldn't save this attempt — weak-topic tracking may be affected.",
            { error: true },
          ),
      },
    );
    /* A resumed draft carries the earlier sitting's answers and their times;
       crediting those is right — it was real study — and studyClock's per-answer
       cap handles a question that sat open overnight. */
    studyClock.commit(answers.map((a) => (a.secondsSpent ?? 0) * 1000));
    // Runs on the transition into "finished" only; `answers` is frozen by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  /* `question` is undefined once `finished` (index runs past the end) — that's
     fine, since `choose` below is only ever invoked from the keyboard-shortcut
     handlers or the choice buttons, both gated off once finished. */
  const question = questions[index];

  const choose = (chosenIndex: number) => {
    if (answered) return;
    const correct = chosenIndex === question.correctIndex;
    setAnswered({ chosenIndex, correct });

    const entry = {
      questionId: question.id ?? index,
      chosenIndex,
      correct,
      topic: question.topic,
      secondsSpent: Math.max(
        0,
        Math.round((Date.now() - questionShownAt.current) / 1000),
      ),
    };

    /* One row per question, replacing rather than appending.
     *
     * This was a blind append, so a question answered twice in one run was
     * stored twice: leave mid-quiz, come back, take Resume, and the draft
     * restores an index that can sit on a question the answers array
     * already covers. A two-question quiz came back with three rows. The
     * displayed score was right — it counts correct entries — which is why
     * it went unnoticed, but `answers_json` is what the evidence layer
     * reads for per-topic accuracy, so the duplicate quietly weighted one
     * question twice in the misconception ledger. */
    setAnswers((prev) => {
      const at = prev.findIndex((a) => a.questionId === entry.questionId);
      if (at === -1) return [...prev, entry];
      const merged = [...prev];
      merged[at] = entry;
      return merged;
    });
  };

  const next = () => {
    setAnswered(null);
    setIndex((i) => i + 1);
  };

  /* Keyboard shortcuts: 1-4 or A-D to choose answer, Enter/Space to next.
   *
   * Must be called unconditionally on every render — it sits above the
   * `if (finished)` early return below so the hook order never changes
   * between renders (a hook call after a conditional return violates the
   * Rules of Hooks: React throws "Rendered fewer hooks than expected" the
   * moment `finished` flips true). `enabled: !finished` is what actually
   * turns the shortcuts off once the quiz ends, not the early return. */
  useKeyboardShortcuts(
    {
      "1": () => !answered && choose(0),
      "2": () => !answered && choose(1),
      "3": () => !answered && choose(2),
      "4": () => !answered && choose(3),
      "a": () => !answered && choose(0),
      "b": () => !answered && choose(1),
      "c": () => !answered && choose(2),
      "d": () => !answered && choose(3),
      "Enter": () => answered && next(),
      " ": () => answered && next(),
    },
    { enabled: !finished },
  );

  if (finished) {
    const weakTopics = weakTopicsFrom(answers);
    return (
      <div className={styles.view}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <QuizHost
            message={
              score === total
                ? `Finished! ${score} out of ${total}. Nothing to fix here.`
                : `Finished! You got ${score} out of ${total}. Let's fix what slipped.`
            }
          />
          <ExitLink />
          {/* Confetti on a zero read as sarcasm. */}
          <h2>{score === total ? "Quiz Complete! 🎉" : "Quiz Complete"}</h2>
          <p className={styles.score}>
            {score} / {total} correct
          </p>
          {weakTopics.length > 0 ? (
            <p className={styles.muted}>
              Topics to review: {weakTopics.join(", ")}
            </p>
          ) : null}
          <div className={styles.actions}>
            {/* The screen named the weak topics and then offered no way to
                act on them — "check your weak topics" pointed at a
                destination that was not on the page. The Solver is the
                tool built for "I got this wrong and don't know why", and
                it takes the topic straight from here. */}
            {weakTopics.length > 0 ? (
              <Link
                to={`/solver?topic=${encodeURIComponent(weakTopics[0])}`}
                className={`${styles.actionLink} ${styles.actionLinkPrimary}`}
              >
                <Icon name="target" size={16} />
                Work on {weakTopics[0]}
              </Link>
            ) : null}
            <Link
              to={`/quiz/${quizId}/review`}
              className={`${styles.actionLink} ${
                weakTopics.length > 0 ? "" : styles.actionLinkPrimary
              }`}
            >
              <Icon name="list-checks" size={16} />
              Review answers
            </Link>
            {/* Retrieval practice works by repetition; a student who just
                scored 3/10 had to leave and find the quiz again to retry. */}
            <button
              type="button"
              className={styles.actionLink}
              onClick={onRetake}
            >
              <Icon name="refresh-cw" size={16} />
              Retake quiz
            </button>
            <Link to={QUIZZES_PATH} className={styles.actionLink}>
              Back to Quizzes
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  /* The verdict is stated by the runner, never left to `question.feedback`:
     that string is generated once per question and shown whatever the student
     picked, so a wrong answer used to be met with the model's "Nice work!"
     and only the avatar's colour to say otherwise. */
  let hostMessage = "";
  let hostVerdict: string | undefined;
  let hostTone: HostTone = null;
  if (answered) {
    const { verdict, detail } = hostFeedback(question, answered.correct);
    hostVerdict = verdict;
    hostMessage = detail;
    hostTone = answered.correct ? "correct" : "incorrect";
  }

  return (
    <div className={styles.view}>
      <Card variant="panel" padding="lg" className={styles.panel}>
        {hostMessage || hostVerdict ? (
          <QuizHost
            message={hostMessage}
            verdict={hostVerdict}
            tone={hostTone}
          />
        ) : null}
        <ExitLink />
        <p className={styles.progress}>
          Question {index + 1} of {questions.length}
        </p>
        <h2 className={styles.question}>{question.question}</h2>

        <div className={styles.choices}>
          {question.choices.map((choice, i) => {
            const isCorrect = i === question.correctIndex;
            const isChosen = answered?.chosenIndex === i;
            const classes = [
              styles.choice,
              answered && isCorrect ? styles.correctChoice : null,
              answered && isChosen && !isCorrect ? styles.wrongChoice : null,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={i}
                type="button"
                className={classes}
                disabled={!!answered}
                onClick={() => choose(i)}
              >
                {choice}
              </button>
            );
          })}
        </div>

        {answered && !answered.correct && chat ? (
          /* The runner states the right answer; this is for "but why?".
             Sent with the question, the pick and the answer so the student
             does not have to retype any of it. */
          <div className={styles.askWhyRow}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const picked = question.choices[answered.chosenIndex];
                const right = question.choices[question.correctIndex];
                chat.open();
                void chat.send(
                  `In a quiz I was asked: "${question.question}". I answered "${picked}", but the answer is "${right}". Explain simply why "${right}" is right and where my thinking went wrong.`,
                );
              }}
            >
              <Icon name="sparkles" size={14} /> Ask AI why
            </Button>
          </div>
        ) : null}

        {answered ? (
          <div className={styles.nextRow}>
            <Button variant="primary" onClick={next}>
              {index + 1 === questions.length
                ? "See results →"
                : "Next Question →"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
