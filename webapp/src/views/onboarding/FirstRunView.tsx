import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { MasteryLadder } from "../../components/learning/MasteryLadder";
import { TutorTurn } from "../../components/learning/TutorTurn";
import { generateQuizQuestions } from "../../api/aiQuiz";
import { decksApi } from "../../api/decks";
import { flashcardsApi } from "../../api/flashcards";
import { useAuth } from "../../context/auth";
import { useCreateModal } from "../../context/createModal";
import { useSettings } from "../../context/settings";
import { decksKeys } from "../../hooks/useDecks";
import { flashcardsKeys } from "../../hooks/useFlashcards";
import { useLifeContext } from "../../hooks/useLifeContext";
import { useSaveExam } from "../../hooks/useExams";
import { useUpdateProfile } from "../../hooks/useAuthActions";
import { fenceUntrusted } from "../../lib/actionTags";
import type { QuizQuestion } from "../../lib/aiJson";
import { localDateStr } from "../../lib/date";
import {
  EMPTY_ANSWERS,
  markOnboardedLocally,
  ONBOARDING_METADATA_KEY,
  ONBOARDING_VERSION,
  type OnboardingAnswers,
} from "../../lib/onboarding";
import { useAiTask } from "../session/useAiTask";
import text from "../../styles/text.module.css";
import styles from "./firstRun.module.css";

const EXAMPLES = ["Quadratic equations", "Causes of WW1", "Supply & demand"];

/* Session length → Life Sync's block sizes, which the planner already uses. */
export const SESSION_LENGTHS = [
  { id: "short", label: "10 min", minBlockMins: 10, maxBlockMins: 15 },
  { id: "medium", label: "25 min", minBlockMins: 20, maxBlockMins: 30 },
  { id: "long", label: "1 hr+", minBlockMins: 30, maxBlockMins: 90 },
] as const;

type Step = "start" | "lesson" | "win";
const STEPS: Step[] = ["start", "lesson", "win"];

const KEYS = ["A", "B", "C", "D", "E"];

/* /welcome, first run (2026-09 redesign): value first. One question — what
 * are you studying? — then a three-minute lesson built on it, a small win,
 * and only then two planning questions. No account or preference questions
 * before the first lesson; the full setup wizard is still in Settings. */
export function FirstRunView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { openCreateModal } = useCreateModal();
  const { update: updateLifeContext } = useLifeContext();
  const saveExam = useSaveExam();
  const updateProfile = useUpdateProfile();
  const task = useAiTask();

  const [step, setStep] = useState<Step>("start");
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkAnswer, setCheckAnswer] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [examDate, setExamDate] = useState("");
  const [length, setLength] = useState<(typeof SESSION_LENGTHS)[number]["id"] | null>(null);
  const [saving, setSaving] = useState(false);
  const savedCards = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /* Each step is a new screenful; move focus so a screen reader follows. */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, checking]);

  const firstName = useMemo(() => {
    const full = (user?.user_metadata as Record<string, unknown> | undefined)?.full_name;
    return typeof full === "string" ? full.trim().split(/\s+/)[0] || null : null;
  }, [user]);

  const markDone = async (skipped: boolean) => {
    if (user) markOnboardedLocally(user.id);
    try {
      await updateProfile.mutateAsync({
        [ONBOARDING_METADATA_KEY]: {
          ...EMPTY_ANSWERS,
          version: ONBOARDING_VERSION,
          completedAt: new Date().toISOString(),
          skipped,
        } satisfies OnboardingAnswers,
      });
    } catch {
      /* The local mark already lets them through; the metadata only carries
         "set up" to their other devices. */
    }
  };

  const loadLesson = (subject: string) =>
    task.run(
      () =>
        generateQuizQuestions({
          sourceText: `Topic: ${fenceUntrusted(subject)}\nWrite the first question as a "guess what happens" question a beginner could reasonably guess at, and the second as a check that the idea landed.`,
          topic: fenceUntrusted(subject),
          settings,
          options: { questionCount: 2, difficulty: "Easy" },
        }),
      (qs) => setQuestions(qs),
    );

  const begin = (value: string) => {
    const subject = value.trim();
    if (!subject) return;
    setTopic(subject);
    setStartedAt(Date.now());
    setStep("lesson");
    loadLesson(subject);
  };

  /* Notes, slides or a worksheet go through the normal create flow, which
     takes the student straight to what it built — so they are counted as set
     up first, or the gate would send them back here. */
  const dropNotes = () => {
    if (user) markOnboardedLocally(user.id);
    void markDone(false);
    openCreateModal({ type: "material", outputs: { flashcards: true, notes: true } });
  };

  const q1 = questions?.[0];
  const q2 = questions?.[1] ?? questions?.[0];
  const passed =
    checkAnswer !== null && q2 !== undefined && checkAnswer === q2.correctIndex;
  const minutes = startedAt
    ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000))
    : 1;

  /* The lesson's two questions become two flashcards, so Recall can bring
     the idea back before it fades. Once, and best-effort. */
  const saveCards = async () => {
    if (savedCards.current || !questions?.length) return;
    savedCards.current = true;
    try {
      const deck = await decksApi.add(null, topic);
      await flashcardsApi.addBatch(
        deck.id,
        questions.map((q) => ({ front: q.question, back: q.choices[q.correctIndex] })),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: decksKeys.all }),
        qc.invalidateQueries({ queryKey: flashcardsKeys.all }),
      ]);
    } catch {
      /* Not worth interrupting a first win over. */
    }
  };

  const toWin = () => {
    void saveCards();
    setStep("win");
  };

  const savePlan = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const chosen = SESSION_LENGTHS.find((l) => l.id === length);
    if (chosen) {
      updateLifeContext({
        minBlockMins: chosen.minBlockMins,
        maxBlockMins: chosen.maxBlockMins,
      });
    }
    if (examDate && examDate >= localDateStr()) {
      try {
        await saveExam.mutateAsync({
          payload: { exam_name: `${topic} exam`, exam_date: examDate },
        });
      } catch {
        /* Addable from Plan ▸ Exams; not a reason to hold them here. */
      }
    }
    await markDone(false);
    navigate("/", { replace: true });
  };

  const skip = async () => {
    await markDone(true);
    navigate("/", { replace: true });
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            L
          </span>
          Learnora
        </span>
        <ol className={styles.progress} aria-label={`Step ${stepIndex + 1} of 3`}>
          {STEPS.map((s, i) => (
            <li key={s} data-done={i <= stepIndex || undefined} />
          ))}
        </ol>
        <button type="button" className={styles.skip} onClick={() => void skip()}>
          Skip for now
        </button>
      </header>

      {step === "start" ? (
        <main className={styles.startGrid}>
          <form
            className={styles.startLeft}
            onSubmit={(e) => {
              e.preventDefault();
              begin(topic);
            }}
          >
            <h1 ref={headingRef} tabIndex={-1} className={`${text.display} ${styles.headline}`}>
              {firstName ? `${firstName}, what are you studying right now?` : "What are you studying right now?"}
            </h1>
            <p className={styles.sub}>
              Give us one topic, or drop in your notes. You'll get a short lesson
              built from it in about a minute.
            </p>
            <div className={styles.topicRow}>
              <input
                className={styles.topicInput}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Cellular respiration"
                aria-label="What you're studying"
                autoFocus
              />
              <Button type="submit" variant="primary" disabled={!topic.trim()}>
                Start
              </Button>
            </div>
            <div className={styles.examples}>
              <span className={styles.examplesLabel}>Or try:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className={styles.example} onClick={() => begin(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </form>
          <button type="button" className={styles.drop} onClick={dropNotes}>
            <Icon name="upload-cloud" size={32} />
            <span className={styles.dropTitle}>Drop notes, slides or a worksheet</span>
            <span className={styles.dropText}>
              PDF, images or docs, up to 200 pages. Only you can see them, and
              you can delete them at any time.
            </span>
          </button>
        </main>
      ) : null}

      {step === "lesson" ? (
        <main className={styles.lesson}>
          <p className={text.meta}>First lesson · {topic}</p>
          <h1 ref={headingRef} tabIndex={-1} className={styles.srOnly}>
            First lesson on {topic}
          </h1>
          {task.pending ? (
            <TutorTurn meta="Getting ready" streaming>
              <p>Writing a short lesson on {topic}…</p>
            </TutorTurn>
          ) : task.error ? (
            <AiErrorCard
              detail={task.error}
              onRetry={() => loadLesson(topic)}
              onFallback={() => void skip()}
              fallbackLabel="Skip to my plan"
              kept="Nothing is lost by skipping: your topic is kept and you can start a lesson from Study any time."
            />
          ) : q1 && !checking ? (
            <TutorTurn
              meta="Quick one first"
              check={
                guess === null ? (
                  <Options question={q1} onPick={setGuess} />
                ) : (
                  <div className={styles.results}>
                    <p className={styles.result} data-result={guess === q1.correctIndex ? "right" : "wrong"}>
                      {guess === q1.correctIndex ? "✓" : "✕"} Your guess: {q1.choices[guess]}
                    </p>
                    {guess !== q1.correctIndex ? (
                      <p className={styles.result} data-result="right">
                        ✓ Answer: {q1.choices[q1.correctIndex]}
                      </p>
                    ) : null}
                    <div className={styles.explain}>
                      {guess !== q1.correctIndex ? (
                        <p>
                          That's a common first guess, and making it helps: the
                          answer now has something to attach to.
                        </p>
                      ) : null}
                      {q1.feedback ? <p>{q1.feedback}</p> : null}
                    </div>
                    <Button variant="primary" onClick={() => setChecking(true)}>
                      Show me how →
                    </Button>
                  </div>
                )
              }
            >
              <p>{q1.question}</p>
              {guess === null ? (
                <p className={styles.note}>No penalty for guessing. It tells us where to start.</p>
              ) : null}
            </TutorTurn>
          ) : q2 && checking ? (
            <TutorTurn
              meta="Now check it landed"
              check={
                checkAnswer === null ? (
                  <Options question={q2} onPick={setCheckAnswer} />
                ) : (
                  <div className={styles.results}>
                    <p className={styles.result} data-result={passed ? "right" : "wrong"}>
                      {passed ? "✓ Right." : `✕ Not this time. The answer is ${q2.choices[q2.correctIndex]}.`}
                    </p>
                    {q2.feedback ? <p className={styles.explain}>{q2.feedback}</p> : null}
                    <Button variant="primary" onClick={toWin}>
                      Continue →
                    </Button>
                  </div>
                )
              }
            >
              <p>{q2.question}</p>
            </TutorTurn>
          ) : null}
        </main>
      ) : null}

      {step === "win" ? (
        <main className={styles.winGrid}>
          <div className={styles.winLeft}>
            <p className={`${text.meta} ${passed ? styles.passed : ""}`}>
              {minutes} {minutes === 1 ? "minute" : "minutes"}
              {passed ? " · first check passed" : " · first check done"}
            </p>
            <h1 ref={headingRef} tabIndex={-1} className={`${text.display} ${styles.headline}`}>
              {passed
                ? `You've got the first idea in ${topic}.`
                : `You've made a start on ${topic}.`}
            </h1>
            <div className={styles.ladder}>
              <MasteryLadder
                topic={topic}
                rung={passed ? 2 : 1}
                gainedFrom={passed ? 1 : 0}
                showRungLabels
              />
            </div>
            <p className={styles.sub}>
              We saved the lesson as flashcards. Recall will bring it back
              before it starts to fade.
            </p>
          </div>
          <form className={styles.planCard} onSubmit={(e) => void savePlan(e)}>
            <h2 className={styles.planTitle}>Two questions so we can plan with you</h2>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>When is your exam? (optional)</span>
              <input
                type="date"
                className={styles.dateInput}
                value={examDate}
                min={localDateStr()}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </label>
            <div className={styles.field} role="group" aria-labelledby="length-label">
              <span id="length-label" className={styles.fieldLabel}>
                How long do you usually study in one go?
              </span>
              <div className={styles.segments}>
                {SESSION_LENGTHS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={styles.segment}
                    aria-pressed={length === l.id}
                    onClick={() => setLength(length === l.id ? null : l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" busy={saving}>
              {saving ? "Saving" : "Save and see my plan"}
            </Button>
            <button type="button" className={styles.skipLink} onClick={() => void skip()}>
              Skip for now
            </button>
          </form>
        </main>
      ) : null}
    </div>
  );
}

function Options({
  question,
  onPick,
}: {
  question: QuizQuestion;
  onPick: (index: number) => void;
}) {
  return (
    <ul className={styles.options} aria-label="Choices">
      {question.choices.map((choice, i) => (
        <li key={i}>
          <button type="button" className={styles.option} onClick={() => onPick(i)}>
            <span className={styles.key} aria-hidden="true">
              {KEYS[i]}
            </span>
            {choice}
          </button>
        </li>
      ))}
    </ul>
  );
}
