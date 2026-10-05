import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { MasteryLadder } from "../../components/learning/MasteryLadder";
import { TutorTurn } from "../../components/learning/TutorTurn";
import { generateFirstLesson, type FirstLesson } from "../../api/firstLesson";
import { learningEventsApi } from "../../api/learningEvents";
import { decksApi } from "../../api/decks";
import { flashcardsApi } from "../../api/flashcards";
import { useAuth } from "../../context/auth";
import { useCreateModal } from "../../context/createModal";
import { decksKeys } from "../../hooks/useDecks";
import { flashcardsKeys } from "../../hooks/useFlashcards";
import { useLifeContext } from "../../hooks/useLifeContext";
import { SYLLABUS_SPECS, defaultTier, getSpec, specLabel, suggestSpecs } from "../../lib/syllabus";
import { useSaveExam } from "../../hooks/useExams";
import { useUpdateProfile } from "../../hooks/useAuthActions";
import type { QuizQuestion } from "../../lib/aiJson";
import type { Flashcard } from "../../api/types";
import { buildTopicStates } from "../../lib/trajectory";
import { topicMastery, type MasteryRung } from "../../lib/mastery";
import { normaliseTopicKey } from "../../lib/topicKey";
import { studentLevel } from "../../lib/studentLevel";
import { savePendingTopic } from "../../lib/pendingTopic";
import { localDateStr } from "../../lib/date";
import {
  EMPTY_ANSWERS,
  examBoardLabel,
  type ExamTypeId,
  markOnboardedLocally,
  ONBOARDING_METADATA_KEY,
  ONBOARDING_VERSION,
  type OnboardingAnswers,
} from "../../lib/onboarding";
import { useAiTask } from "../session/useAiTask";
import text from "../../styles/text.module.css";
import styles from "./firstRun.module.css";

const EXAMPLES = ["Quadratic equations", "Causes of WW1", "Supply & demand"];

/* What they're studying for. The redesigned first run asked nothing, so
   every new account reached the AI with no level: an en-US browser meant a
   GCSE student was marked against "AP / College Board". One optional row of
   chips, kept in the same onboarding answers lib/studentLevel reads. */
const LEVELS: ReadonlyArray<{ id: string; label: string; examType?: ExamTypeId; university?: true }> = [
  { id: "gcse", label: "GCSE", examType: "gcse" },
  { id: "a_level", label: "A-Level", examType: "a_level" },
  { id: "ib", label: "IB", examType: "ib" },
  { id: "ap", label: "AP", examType: "ap" },
  { id: "university", label: "University", university: true },
];

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
  const { openCreateModal } = useCreateModal();
  const { update: updateLifeContext } = useLifeContext();
  const saveExam = useSaveExam();
  const updateProfile = useUpdateProfile();
  const task = useAiTask();

  const [step, setStep] = useState<Step>("start");
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState<FirstLesson | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  /* hook → teach → check, inside the lesson step. */
  const [phase, setPhase] = useState<"hook" | "teach" | "check">("hook");
  const checking = phase === "check";
  const [checkAnswer, setCheckAnswer] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [examDate, setExamDate] = useState("");
  /* "" = not chosen yet (a suggestion from the topic may apply), "none" =
     the student said it isn't listed. */
  const [specChoice, setSpecChoice] = useState("");
  const [length, setLength] = useState<(typeof SESSION_LENGTHS)[number]["id"] | null>(null);
  const [saving, setSaving] = useState(false);
  const savedCards = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  /* Each step is a new screenful; move focus so a screen reader follows. */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, phase]);

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
          examType: chosenLevel?.examType ?? null,
          goal: chosenLevel?.university ? "university" : null,
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

  const chosenLevel = LEVELS.find((l) => l.id === levelId) ?? null;
  /* The specification, when the level is one the ledger covers: the
     student's pick, or the best match for their topic until they pick. The
     tier starts at the superset (Higher / HL) and can be changed on the
     exam later. */
  const specQualification =
    chosenLevel?.examType === "gcse" ? "GCSE" : chosenLevel?.examType === "ib" ? "IB" : null;
  const specOptions = specQualification
    ? SYLLABUS_SPECS.filter((s) => s.qualification === specQualification)
    : [];
  const chosenSpec = !specQualification
    ? null
    : specChoice === "none"
      ? null
      : specChoice
        ? getSpec(specChoice)
        : (suggestSpecs(topic, specQualification)[0] ?? null);
  const levelLabel = async () =>
    chosenLevel?.examType
      ? examBoardLabel(chosenLevel.examType)
      : chosenLevel?.university
        ? "university"
        : studentLevel();

  const loadLesson = (subject: string) =>
    task.run(
      async () => generateFirstLesson(subject, await levelLabel()),
      (l) => setLesson(l),
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

  const q1 = lesson?.hook;
  const q2 = lesson?.check;
  const passed =
    checkAnswer !== null && q2 !== undefined && checkAnswer === q2.correctIndex;

  /* The check is real evidence: recorded once, on the topic the saved deck
     is named after, so Today reads the same result this screen shows. */
  const answerCheck = (index: number) => {
    setCheckAnswer(index);
    if (!q2) return;
    void learningEventsApi
      .record({
        source: "quick_check",
        topicKey: normaliseTopicKey(topic),
        score: index === q2.correctIndex ? 1 : 0,
        clientId: `first-run:${user?.id ?? "anon"}:${normaliseTopicKey(topic)}`,
        payload: { mode: "first-run", concept: lesson?.concept },
      })
      .catch(() => {
        /* Best-effort, like every other evidence write. */
      });
  };

  /* The ladder on the win screen, computed the way Today computes it — it
     used to be hard-coded to "Recalled", and Today showed the same topic as
     "Not started" a moment later. */
  const winMastery = useMemo<{ rung: MasteryRung; fading: boolean }>(() => {
    if (checkAnswer === null || !q2) return { rung: 0, fading: false };
    const now = new Date();
    const cards = [q1, q2].map(
      (_, i) =>
        ({
          id: `c${i}`,
          deck_id: "first",
          srs_interval: 0,
          ease_factor: 2.5,
          next_review_date: null,
          created_at: now.toISOString(),
        }) as unknown as Flashcard,
    );
    const [state] = buildTopicStates({
      decks: [{ id: "first", title: topic, folder_id: null } as never],
      cards,
      attempts: [],
      now,
      events: [
        {
          id: "e", user_id: "", topic_key: normaliseTopicKey(topic), deck_id: null, folder_id: null,
          source: "quick_check", score: passed ? 1 : 0, minutes: 0, occurred_at: now.toISOString(),
          payload: {}, client_id: null,
        },
      ],
    });
    return state ? topicMastery(state) : { rung: 0, fading: false };
  }, [checkAnswer, q1, q2, passed, topic]);
  const minutes = startedAt
    ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000))
    : 1;

  /* The lesson's two questions become two flashcards, so Recall can bring
     the idea back before it fades. Once, and best-effort. */
  const saveCards = async () => {
    if (savedCards.current || !lesson) return;
    savedCards.current = true;
    try {
      const deck = await decksApi.add(null, topic);
      /* Options stay on the front: a stem like "Which of these…" is
         unanswerable on its own. The back carries the lesson's teaching. */
      const card = (q: QuizQuestion) => ({
        front: `${q.question}\n\n${q.choices.map((c, i) => `${"ABCDE"[i]}) ${c}`).join("\n")}`,
        back: `${q.choices[q.correctIndex]}\n\n${lesson.explanation}`,
      });
      await flashcardsApi.addBatch(deck.id, [card(lesson.hook), card(lesson.check)]);
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
          payload: {
            exam_name: `${topic} exam`,
            exam_date: examDate,
            syllabus_id: chosenSpec?.id ?? null,
            syllabus_tier: chosenSpec ? defaultTier(chosenSpec) : null,
          },
        });
      } catch {
        /* Addable from Plan ▸ Exams; not a reason to hold them here. */
      }
    }
    await markDone(false);
    navigate("/", { replace: true });
  };

  const skip = async () => {
    /* "Your topic is kept" is what the error card says, so keep it: Study
       opens with it filled in. */
    if (topic.trim() && !lesson && user) savePendingTopic(user.id, topic.trim());
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
            <div className={styles.examples} role="group" aria-labelledby="level-label">
              <span id="level-label" className={styles.examplesLabel}>
                Studying for (optional):
              </span>
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={styles.example}
                  aria-pressed={levelId === l.id}
                  onClick={() => setLevelId(levelId === l.id ? null : l.id)}
                >
                  {l.label}
                </button>
              ))}
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
          ) : q1 && phase === "hook" ? (
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
                    {guess !== q1.correctIndex ? (
                      <p className={styles.explain}>
                        Guessing first helps: the answer now has something to
                        attach to.
                      </p>
                    ) : null}
                    <Button variant="primary" onClick={() => setPhase("teach")}>
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
          ) : lesson && phase === "teach" ? (
            /* The lesson itself. It used to be missing: "Show me how" went
               straight to the next question. */
            <TutorTurn
              meta={`The idea · ${lesson.concept}`}
              check={
                <Button variant="primary" onClick={() => setPhase("check")}>
                  Got it, check me →
                </Button>
              }
            >
              {lesson.explanation.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {lesson.hook.feedback ? (
                <p className={styles.note}>Back to the first question: {lesson.hook.feedback}</p>
              ) : null}
            </TutorTurn>
          ) : q2 && checking ? (
            <TutorTurn
              meta="Now check it landed"
              check={
                checkAnswer === null ? (
                  <Options question={q2} onPick={answerCheck} />
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
                rung={winMastery.rung}
                fading={winMastery.fading}
                gainedFrom={0}
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
            {specOptions.length > 0 && examDate ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Which exam board? (optional)</span>
                <select
                  className={styles.dateInput}
                  value={chosenSpec?.id ?? "none"}
                  onChange={(e) => setSpecChoice(e.target.value)}
                >
                  <option value="none">Not listed / not sure</option>
                  {specOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {specLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
            {/* Several subjects, another country or a board the app doesn't
                know yet: the full study profile (any board, free-text
                subjects, exam dates per subject). */}
            <button
              type="button"
              className={styles.skipLink}
              onClick={() => {
                void markDone(false).then(() => navigate("/setup/profile"));
              }}
            >
              Set up all my subjects instead
            </button>
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
