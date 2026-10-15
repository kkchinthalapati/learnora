import { useEffect, useMemo, useState } from "react";
import { useOptionalAuth } from "../../context/auth";
import { clearPendingTopic, readPendingTopic } from "../../lib/pendingTopic";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useExams } from "../../hooks/useExams";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import {
  activityHref,
  examContext,
  loadRun,
  planSession,
  resolveFocus,
  startRun,
} from "../../lib/adaptiveSession";
import {
  MODE_LABELS,
  newSessionHref,
  type SessionMode,
} from "../../lib/sessionModes";
import text from "../../styles/text.module.css";
import styles from "./studyLab.module.css";

interface ModeCard {
  mode: SessionMode;
  prompt: string;
  description: string;
  icon: IconName;
  /** A variant of the same mode, one link below the card. */
  variant?: { label: string; voice?: boolean; preset?: "traps" };
}

/* For a student who would rather choose: each card opens a Session in one
   mode, and the mode can be switched inside it. */
const MODE_CARDS: ModeCard[] = [
  {
    mode: "explain",
    prompt: "I don't get it yet",
    description:
      "Step by step from the idea underneath, with a quick check after each step.",
    icon: "book-open",
  },
  {
    mode: "socratic",
    prompt: "I want to reason it out",
    description:
      "Questions instead of answers, and hints whenever you're stuck.",
    icon: "help-circle",
    variant: { label: "Oral practice, mic on", voice: true },
  },
  {
    mode: "practice",
    prompt: "I want to solve problems",
    description:
      "Mixed problems, rated for how sure you are, checked one at a time.",
    icon: "target",
    variant: { label: "Exam traps, timed", preset: "traps" },
  },
  {
    mode: "teach",
    prompt: "I think I understand it",
    description:
      "Explain it to someone new. Their questions show what you skipped.",
    icon: "users",
  },
  {
    mode: "recall",
    prompt: "I want to keep it from fading",
    description: "The flashcards that are due, mixed across topics. About ten minutes.",
    icon: "layers",
  },
];

/* /study — one Start. The session picks each activity from the
   misconception ledger and the next exam (lib/adaptiveSession); choosing a
   mode by hand is one link down, not the default. */
export function StudyLabView() {
  const navigate = useNavigate();
  const { ranked, isPending } = useMisconceptions();
  const exams = useExams();
  const folders = useFolders();
  const due = useFlashcardsDueCount();
  const [searchParams] = useSearchParams();
  const userId = useOptionalAuth()?.user?.id;
  /* A first-run topic that never got its lesson (the AI failed and they
     skipped) is waiting here, as the error card promised. */
  const [topic, setTopic] = useState(
    () => searchParams.get("topic")?.trim() || readPendingTopic(userId) || "",
  );
  useEffect(() => {
    if (topic.trim()) clearPendingTopic(userId);
    // Only once the student has seen it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [choosing, setChoosing] = useState(() => searchParams.get("modes") === "1");
  const finished = useMemo(() => {
    const id = searchParams.get("finished");
    return id ? loadRun(id) : null;
  }, [searchParams]);

  const activeTopic = topic.trim();
  const loading = isPending || exams.isPending || due.isPending;
  const exam = useMemo(() => examContext(exams.data, folders.data), [exams.data, folders.data]);
  const focus = useMemo(
    () => resolveFocus({ topic: activeTopic, ranked, exam }),
    [activeTopic, ranked, exam],
  );
  const plan = useMemo(
    () =>
      focus
        ? planSession({ focus, ranked, dueCards: due.data ?? 0, exam })
        : [],
    [focus, ranked, due.data, exam],
  );

  const start = () => {
    if (!focus || !plan[0]) return;
    const run = startRun(focus, plan[0]);
    void navigate(activityHref(plan[0], run.id));
  };

  const href = (mode: SessionMode, extra: { voice?: boolean; preset?: "traps" } = {}) =>
    newSessionHref(mode, { topic: activeTopic || undefined, ...extra });

  return (
    <div className={styles.view}>
      <header className={styles.hero}>
        <span className={text.meta}>Study</span>
        <h1 className={text.display}>One session, picked from your mistakes</h1>
        {finished ? (
          <p className={styles.finished} role="status">
            Session done: {finished.done.length}{" "}
            {finished.done.length === 1 ? "activity" : "activities"} on{" "}
            {finished.focus.topic}. Anything you got wrong is in your ledger, and
            the next session starts from it.
          </p>
        ) : null}
        <label className={styles.topicField}>
          <span className={styles.topicLabel}>Working on something specific?</span>
          <input
            className={styles.topicInput}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="A topic, a question you got wrong, a line from your notes"
          />
        </label>
      </header>

      <section className={styles.session} aria-labelledby="lab-session">
        {loading && !activeTopic ? (
          <p className={styles.caption} role="status">
            Reading your mistakes and exam dates…
          </p>
        ) : focus && plan.length ? (
          <>
            <div>
              <span className={text.meta}>
                {focus.misconceptionId
                  ? `From your work${focus.subject ? ` in ${focus.subject}` : ""}`
                  : exam && !activeTopic
                    ? `For ${exam.name}`
                    : "Your session"}
              </span>
              <h2 id="lab-session" className={text.claim}>
                {focus.topic}
              </h2>
            </div>
            <ol className={styles.steps}>
              {plan.map((activity) => (
                <li key={activity.kind} className={styles.step}>
                  <span className={styles.stepTitle}>{activity.title}</span>
                  <span className={styles.stepWhy}>{activity.why}</span>
                </li>
              ))}
            </ol>
            <p className={styles.caption}>
              Each step is picked when you reach it, from what the one before
              found. Stop whenever you like; what's done counts.
            </p>
            <div>
              <button type="button" className={styles.primary} onClick={start}>
                Start
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="lab-session" className={text.claim}>
              What are you working on?
            </h2>
            <p className={styles.caption}>
              Type a topic above and the session is built around it. Once you
              have an exam date or a few mistakes on record, it picks the topic
              itself.
            </p>
            <div>
              <button type="button" className={styles.primary} disabled>
                Start
              </button>
            </div>
          </>
        )}
      </section>

      <button
        type="button"
        className={styles.chooseToggle}
        aria-expanded={choosing}
        aria-controls="lab-modes"
        onClick={() => setChoosing((c) => !c)}
      >
        {choosing ? "Hide the modes" : "Or choose a mode yourself"}
      </button>

      {choosing ? (
        <section id="lab-modes" className={styles.modeGrid} aria-label="Choose how to study">
          {MODE_CARDS.map((card) => (
            <div key={card.mode} className={styles.modeCard}>
              <Link to={href(card.mode)} className={styles.modeLink}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon name={card.icon} size={20} />
                </span>
                <span className={styles.prompt}>{card.prompt}</span>
                <span className={styles.modeTitle}>{MODE_LABELS[card.mode]}</span>
                <span className={styles.modeText}>{card.description}</span>
              </Link>
              {card.variant ? (
                <Link
                  to={href(card.mode, { voice: card.variant.voice, preset: card.variant.preset })}
                  className={styles.variant}
                >
                  {card.variant.label} →
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <p className={styles.footnote}>
        Or take a saved quiz from the{" "}
        <Link to="/library/quizzes">Library</Link>, or find the traps in past
        papers with <Link to="/exam-detective">Exam Detective</Link>.
      </p>
    </div>
  );
}
