import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { useLearnerStyle } from "../../hooks/useLearnerStyle";
import { useLearnerSignals } from "../../hooks/useLearnerSignals";
import { RateThis } from "../../components/learning/Adapt";
import { learnerSignalsApi } from "../../api/learnerSignals";
import { SECTION_SCORE } from "../../lib/learnerSignals";
import { learnerStyleOption } from "../../lib/learnerStyle";
import { PodcastPlayer } from "./PodcastPlayer";
import { TutorCall } from "./TutorCall";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { TutorTurn } from "../../components/learning/TutorTurn";
import { AiReply } from "../../components/chat/AiReply";
import {
  explainAnotherWay,
  generateLearnStep,
  LEARN_STYLE_LABELS,
  LEARN_STYLES,
  markTypedAnswer,
  proseOnly,
  writeExamQuestion,
  writeLessonFrame,
  type ExamQuestion,
  type LearnStep,
  type LearnStyle,
  type LessonFrame,
} from "../../api/learn";
import { RevealSteps } from "../../lib/openui/revealContext";
import { ProGate, useProAction } from "../../components/ProGate";
import { candidatesFromMarking, type Marking } from "../../lib/photoMarking";
import { useEntitlements } from "../../hooks/useSubscription";
import { learningEventsApi } from "../../api/learningEvents";
import { learnSections, type LearnSection } from "../../lib/learnSections";
import { normaliseTopicKey } from "../../lib/topicKey";
import { learnStorageKey } from "../../lib/learnPosition";
import { explainParts } from "../../api/explainBack";
import { ReminderOffer } from "../../components/learning/ReminderOffer";
import { ExplainBack, type ExplainBackProgress } from "./ExplainBack";
import type { QuizQuestion } from "../../lib/aiJson";
import type { MisconceptionCandidate } from "../../lib/misconceptions";
import styles from "./learn.module.css";

/* Learn: the lesson taught, one section of its notes at a time.
 *
 * Every other tab assumes the student already knows the material and tests
 * or drills it. This one teaches it first. It opens with the big picture
 * (what the topic is, why it matters, what's coming, the words to know).
 * Each section then goes: guess at a question before being told (so the
 * answer has something to attach to), every idea in the section taught from
 * this lesson's notes, with cards and diagrams where they teach better than
 * prose and worked examples uncovered a step at a time, a check, and, on a
 * miss, that idea taught another way with a different check. It closes with
 * how the parts fit together.
 *
 * The guess is never evidence: being wrong before you've been taught is the
 * point of it. The check is, and only the first answer to each question
 * counts. A missed check goes to the misconception ledger; a right answer on
 * the second check after a miss is the correction that closes it. */

type Phase = "hook" | "teach" | "check" | "reteach" | "recheck" | "exam" | "done";
type Outcome = "got" | "relearned" | "revisit";

interface SectionProgress {
  step?: LearnStep;
  phase: Phase;
  guess?: number;
  check?: number;
  recheck?: number;
  outcome?: Outcome;
  /** Plus: the idea re-explained in the styles the student asked for. */
  styled?: Partial<Record<LearnStyle, string>>;
  /** Plus: this part's exam question, the answer and its marking. */
  exam?: ExamProgress;
}

interface LearnState {
  /** The section keys this progress was made against. Edited notes give a
   *  new outline and start the lesson afresh. */
  outline: string[];
  /** -1 is the outline screen; sections.length is the end screen. */
  current: number;
  sections: Record<string, SectionProgress>;
  /** The overview read before part 1 and the recap read at the end. */
  frame?: LessonFrame;
  /** The student has moved on from the overview. */
  introDone?: boolean;
  /** The lesson said back in the student's own words, and what came across. */
  explainBack?: ExplainBackProgress;
}

const KEYS = ["A", "B", "C", "D", "E"];

/** A short, stable tag for a question's wording (FNV-1a). */
function questionHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
/* Shared with Home, which reads how far along a lesson is (lib/learnPosition). */
const storageKey = learnStorageKey;

function freshState(outline: string[]): LearnState {
  return { outline, current: -1, sections: {} };
}

function loadState(materialId: string, outline: string[]): LearnState {
  try {
    const raw = window.localStorage.getItem(storageKey(materialId));
    if (!raw) return freshState(outline);
    const parsed = JSON.parse(raw) as LearnState;
    if (
      !Array.isArray(parsed.outline) ||
      parsed.outline.join("|") !== outline.join("|") ||
      typeof parsed.current !== "number" ||
      typeof parsed.sections !== "object"
    ) {
      return freshState(outline);
    }
    return parsed;
  } catch {
    return freshState(outline);
  }
}

function saveState(materialId: string, state: LearnState) {
  try {
    window.localStorage.setItem(storageKey(materialId), JSON.stringify(state));
  } catch {
    /* Private mode or a full store: the lesson still works, it just won't
       remember where the student got to. */
  }
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  got: "Got it first time",
  relearned: "Got it the second way",
  revisit: "Worth another look",
};

export function LearnPanel({
  materialId,
  title,
  lesson,
  subject,
  markdown,
  loading,
  autoStart = false,
  onOpenTab,
  onFocusChange,
}: {
  materialId: string;
  /** The lesson's title, for the focus bar. */
  title: string;
  /** What the lesson is about, for the prompt and the evidence's topic. */
  lesson: string;
  subject: string | null;
  markdown: string;
  loading: boolean;
  /** Arrived straight from making the lesson: go into it rather than
   *  stopping at the start screen (unless the style question is pending). */
  autoStart?: boolean;
  onOpenTab: (tab: "notes" | "cards" | "quiz") => void;
  /** True while a step, the podcast or a call fills the page, so the lesson
   *  page can hide its header and tabs. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const sections = useMemo(() => learnSections(markdown), [markdown]);
  const outline = useMemo(() => sections.map((s) => s.key), [sections]);

  if (loading) return <div className={styles.loading} aria-busy="true" />;
  if (sections.length === 0) {
    return (
      <EmptyState
        icon="book-open"
        title="Nothing to learn from yet"
        message="Learn teaches from this lesson's notes. Once there are notes, they'll be taught here one part at a time."
      >
        <Link to={`/notes/${encodeURIComponent(materialId)}`} className={styles.quietLink}>
          Open the notes editor
        </Link>
      </EmptyState>
    );
  }
  return (
    <LearnFlow
      /* New notes, new lesson: remount rather than reconcile old answers. */
      key={outline.join("|")}
      materialId={materialId}
      title={title}
      lesson={lesson}
      subject={subject}
      markdown={markdown}
      sections={sections}
      outline={outline}
      autoStart={autoStart}
      onOpenTab={onOpenTab}
      onFocusChange={onFocusChange}
    />
  );
}

type Mode = "steps" | "listen" | "call";

function LearnFlow({
  materialId,
  title,
  lesson,
  subject,
  markdown,
  sections,
  outline,
  autoStart,
  onOpenTab,
  onFocusChange,
}: {
  materialId: string;
  title: string;
  lesson: string;
  subject: string | null;
  markdown: string;
  sections: LearnSection[];
  outline: string[];
  autoStart: boolean;
  onOpenTab: (tab: "notes" | "cards" | "quiz") => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const [state, setState] = useState<LearnState>(() => loadState(materialId, outline));
  const [mode, setMode] = useState<Mode>("steps");
  /* How they learn is set in onboarding and Settings ("How you learn"), never
     asked here: this only shows what lessons are shaped for. */
  const learnerStyle = useLearnerStyle();
  const signals = useLearnerSignals();
  const focused = mode !== "steps" || state.current >= 0;
  useEffect(() => {
    onFocusChange?.(focused);
  }, [focused, onFocusChange]);
  useEffect(() => () => onFocusChange?.(false), [onFocusChange]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Sections being written right now, so a prefetch and a click never ask
     for the same one twice. */
  const inFlight = useRef(new Set<string>());
  /* Bumped whenever a request ends, so a prefetch that failed while the
     student was waiting on that part is retried in the open. */
  const [settled, setSettled] = useState(0);

  useEffect(() => saveState(materialId, state), [materialId, state]);

  const titles = useMemo(() => sections.map((s) => s.title), [sections]);
  const current = state.current;
  const section = current >= 0 ? sections[current] : undefined;
  const progress = section ? state.sections[section.key] : undefined;

  const patch = useCallback((key: string, next: Partial<SectionProgress>) => {
    setState((s) => ({
      ...s,
      sections: { ...s.sections, [key]: { ...(s.sections[key] ?? { phase: "hook" }), ...next } },
    }));
  }, []);

  const write = useCallback(
    async (index: number, { quiet = false } = {}) => {
      const target = sections[index];
      if (!target || inFlight.current.has(target.key)) return;
      inFlight.current.add(target.key);
      if (!quiet) {
        setPending(target.key);
        setError(null);
      }
      try {
        const step = await generateLearnStep({
          materialId,
          lesson,
          section: target,
          otherSections: titles.filter((_, i) => i !== index),
          subject,
        });
        setState((s) =>
          s.sections[target.key]?.step
            ? s
            : { ...s, sections: { ...s.sections, [target.key]: { phase: "hook", step } } },
        );
      } catch (caught) {
        if (!quiet) {
          setError(caught instanceof Error && caught.message ? caught.message : "The tutor didn't answer.");
        }
      } finally {
        inFlight.current.delete(target.key);
        setPending((p) => (p === target.key ? null : p));
        setSettled((n) => n + 1);
      }
    },
    [sections, materialId, lesson, titles, subject],
  );

  /* Arriving at a section with nothing written for it yet: write it. */
  useEffect(() => {
    if (section && !progress?.step && !inFlight.current.has(section.key) && !error) {
      void write(current);
    }
  }, [section, progress?.step, current, write, error, settled]);

  /* While the student reads one section, the next is written, so "Next"
     doesn't mean a wait. The whole lesson shares one billing session, so
     this costs the student nothing extra. */
  useEffect(() => {
    if (progress?.phase !== "teach") return;
    const next = sections[current + 1];
    if (next && !state.sections[next.key]?.step) void write(current + 1, { quiet: true });
  }, [progress?.phase, current, state.sections, sections, write]);

  /* The overview and recap: written when the student first needs one (the
     overview before part 1, the recap at the end), once per lesson. */
  const [frameBusy, setFrameBusy] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const showingIntro = current === 0 && !state.introDone;
  const showingEnd = current >= sections.length;
  const writeFrame = useCallback(async () => {
    setFrameBusy(true);
    setFrameError(null);
    try {
      const frame = await writeLessonFrame({ materialId, lesson, sections, subject });
      setState((s) => ({ ...s, frame }));
    } catch (caught) {
      setFrameError(caught instanceof Error && caught.message ? caught.message : "The tutor didn't answer.");
    } finally {
      setFrameBusy(false);
    }
  }, [materialId, lesson, sections, subject]);
  useEffect(() => {
    if ((showingIntro || showingEnd) && !state.frame && !frameBusy && !frameError) void writeFrame();
  }, [showingIntro, showingEnd, state.frame, frameBusy, frameError, writeFrame]);

  const goTo = (index: number) => {
    setError(null);
    setMode("steps");
    setState((s) => ({ ...s, current: index }));
    window.scrollTo?.({ top: 0 });
  };

  /* Straight from making the lesson: into the overview, unless there's
     progress already (the start screen then shows where they got to). */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    if (state.current < 0 && !sections.some((s) => state.sections[s.key])) goTo(0);
    // Once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const minutes = Math.max(3, sections.length * 4);
  const focusFrame = (body: ReactNode, sub: string, progressIndex: number | null) => (
    <FocusFrame
      title={title}
      sub={sub}
      sections={sections}
      state={state}
      progressIndex={progressIndex}
      mode={mode}
      onExit={() => {
        setMode("steps");
        setState((s) => ({ ...s, current: -1 }));
      }}
      onMode={setMode}
    >
      {body}
    </FocusFrame>
  );

  if (mode === "listen") {
    /* The parts missed in Learn, for an episode on only those. */
    const missed = sections.filter((s) => state.sections[s.key]?.outcome === "revisit").map((s) => s.title);
    return focusFrame(
      <PodcastPlayer materialId={materialId} lesson={lesson} notes={markdown} subject={subject} missed={missed} />,
      "Listen · podcast",
      null,
    );
  }
  if (mode === "call") {
    return focusFrame(
      <TutorCall materialId={materialId} lesson={lesson} onEnd={() => setMode("steps")} />,
      "Talk it through · call",
      null,
    );
  }

  /* Evidence for one check answer. The client id is per question, so a
     reload, a replay or a second click never counts twice, while learning a
     part again (new questions) counts as a new attempt. */
  const recordCheck = (question: QuizQuestion, which: "check" | "recheck", right: boolean, step: LearnStep) => {
    if (!section) return;
    const clientId = `learn:${materialId}:${section.key}:${which}:${questionHash(question.question)}`;
    const candidates: MisconceptionCandidate[] =
      which === "check" && right
        ? []
        : [
            {
              subject: subject || "General",
              concept: step.concept,
              summary: question.feedback || proseOnly(step.explanation).slice(0, 280),
              severity: "moderate",
              tool: "notes",
              kind: right ? "correction" : "evidence",
              detail: `Check question: ${question.question}`,
              idempotencyKey: clientId,
            },
          ];
    void learningEventsApi
      .record(
        {
          source: "quick_check",
          topicKey: normaliseTopicKey(lesson),
          score: right ? 1 : 0,
          clientId,
          payload: { mode: "learn", concept: step.concept, section: section.title, materialId },
        },
        candidates,
      )
      .catch(() => {
        /* Best-effort, like every other evidence write. */
      });
  };

  const answer = (which: "check" | "recheck", index: number) => {
    if (!section || !progress?.step || progress[which] !== undefined) return;
    const step = progress.step;
    const question = which === "check" ? step.check : step.recheck;
    const right = index === question.correctIndex;
    recordCheck(question, which, right, step);
    /* How the part went, with the style it was taught in: what a style
       suggestion is built from (lib/learnerSignals.ts suggestStyle). */
    const outcome = which === "check" ? (right ? "got" : null) : right ? "relearned" : "revisit";
    if (outcome) {
      void signals.record({
        kind: "section_result",
        surface: "learn",
        style: learnerStyle.style,
        score: SECTION_SCORE[outcome],
        topicKey: normaliseTopicKey(lesson),
        ref: `${materialId}:${section.key}`,
        clientId: `learn-result:${materialId}:${section.key}:${questionHash(question.question)}`,
      });
    }
    patch(section.key, {
      [which]: index,
      ...(which === "check" && right ? { outcome: "got" as const } : {}),
      ...(which === "recheck" ? { outcome: right ? ("relearned" as const) : ("revisit" as const) } : {}),
    });
  };

  const learnAgain = (key: string) => {
    const index = sections.findIndex((s) => s.key === key);
    setState((s) => {
      const rest = { ...s.sections };
      delete rest[key];
      return { ...s, sections: rest, current: index };
    });
    setError(null);
  };

  const startOver = () => {
    setError(null);
    /* The notes haven't changed, so the overview still fits. */
    setState((s) => ({ ...freshState(outline), frame: s.frame }));
  };

  /* --- The outline ------------------------------------------------------ */
  if (state.current < 0) {
    const started = sections.some((s) => state.sections[s.key]?.guess !== undefined);
    const resumeAt = sections.findIndex((s) => !state.sections[s.key]?.outcome);
    const done = sections.filter((s) => state.sections[s.key]?.outcome).length;
    return (
      <div className={styles.cover}>
        <section className={styles.coverCard} aria-labelledby="learn-cover-title">
          <p className={styles.eyebrow}>
            {sections.length} {sections.length === 1 ? "part" : "parts"} · about {minutes} min
            {started ? ` · ${done} of ${sections.length} done` : ""}
          </p>
          <h2 id="learn-cover-title" className={styles.coverTitle}>
            {!started ? "Ready to learn this?" : resumeAt === -1 ? "You've been through it all" : "Pick up where you left off"}
          </h2>
          <p className={styles.lead}>
            The big picture first, then each part taught from your notes: a quick guess, the idea explained, then a
            check. Miss one and it's explained another way.
          </p>

          {learnerStyle.style ? (
            <p className={styles.styleLine}>
              <Icon name={learnerStyleOption(learnerStyle.style).icon} size={16} />
              <span>
                Shaped for <strong>{learnerStyleOption(learnerStyle.style).label.toLowerCase()}</strong>
              </span>
              <Link className={styles.quietLink} to="/settings?tab=study#how-you-learn">
                Change in Settings
              </Link>
            </p>
          ) : (
            <p className={styles.styleLine}>
              <Icon name="sparkles" size={16} />
              <span>Tell us how you learn and every lesson is shaped around it.</span>
              <Link className={styles.quietLink} to="/settings?tab=study#how-you-learn">
                How you learn
              </Link>
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="primary" size="lg" onClick={() => goTo(resumeAt === -1 ? sections.length : resumeAt)}>
              {!started ? "Start learning" : resumeAt === -1 ? "See how it went" : `Carry on: ${sections[resumeAt].title}`}
            </Button>
            {started ? (
              <button type="button" className={styles.quietLink} onClick={startOver}>
                Start over
              </button>
            ) : null}
          </div>
        </section>

        <div className={styles.modes} role="group" aria-label="Other ways to learn this">
          <button type="button" className={styles.modeCard} onClick={() => setMode("listen")}>
            <span className={styles.modeIcon} aria-hidden="true">
              <Icon name="headphones" size={20} />
            </span>
            <span className={styles.modeText}>
              <span className={styles.modeLabel}>Listen</span>
              <span className={styles.modeHint}>An episode of this lesson, made your way</span>
            </span>
          </button>
          <button type="button" className={styles.modeCard} onClick={() => setMode("call")}>
            <span className={styles.modeIcon} aria-hidden="true">
              <Icon name="phone" size={20} />
            </span>
            <span className={styles.modeText}>
              <span className={styles.modeLabel}>Talk it through</span>
              <span className={styles.modeHint}>A voice call with your tutor</span>
            </span>
          </button>
        </div>

        <section aria-labelledby="learn-outline-title">
          <h3 id="learn-outline-title" className={styles.outlineTitle}>
            What's in it
          </h3>
          <Outline sections={sections} state={state} onPick={goTo} />
        </section>
      </div>
    );
  }

  /* --- The end ---------------------------------------------------------- */
  if (!section) {
    const revisit = sections.filter((s) => state.sections[s.key]?.outcome === "revisit");
    const skipped = sections.filter((s) => !state.sections[s.key]?.outcome);
    const learned = sections.length - revisit.length - skipped.length;
    return focusFrame(
      <div className={styles.flow}>
        <div className={styles.intro}>
          <h2 className={styles.introTitle}>
            {learned === sections.length ? "You've learned this lesson." : "That's the whole lesson."}
          </h2>
          <p className={styles.lead}>
            {learned} of {sections.length} {sections.length === 1 ? "part" : "parts"} checked and understood.
            {revisit.length ? " The ones worth another look are saved to your mistakes, so they come back." : ""}
          </p>
        </div>
        {state.frame ? (
          <TutorTurn variant="card" meta="Putting it together">
            <AiReply text={state.frame.recap} notes />
          </TutorTurn>
        ) : frameBusy ? (
          <TutorTurn variant="card" meta="Putting it together" streaming>
            <p>Writing how it all fits together…</p>
          </TutorTurn>
        ) : null}
        {/* Only once at least one part was actually worked through: a lesson
            skipped end to end has nothing to explain back. */}
        {skipped.length < sections.length ? (
          <ExplainBack
            materialId={materialId}
            lesson={lesson}
            subject={subject}
            parts={explainParts(
              sections,
              Object.fromEntries(sections.map((s) => [s.key, state.sections[s.key]?.step?.concept])),
            )}
            saved={state.explainBack}
            onSave={(explainBack) => setState((s) => ({ ...s, explainBack }))}
            onRevisit={learnAgain}
          />
        ) : null}
        <RateThis
          surface="learn"
          refId={`learn-lesson:${materialId}:${questionHash(sections.map((s) => s.key).join("|"))}`}
          style={learnerStyle.style}
          topicKey={normaliseTopicKey(lesson)}
        />
        <Outline sections={sections} state={state} onPick={goTo} />
        {revisit.length ? (
          <div className={styles.actions}>
            {revisit.map((s) => (
              <Button key={s.key} variant="secondary" onClick={() => learnAgain(s.key)}>
                Learn "{s.title}" again
              </Button>
            ))}
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => onOpenTab("cards")}>
            Lock it in with cards
          </Button>
          <Button variant="secondary" onClick={() => onOpenTab("quiz")}>
            Take the quiz
          </Button>
          <button type="button" className={styles.quietLink} onClick={() => goTo(-1)}>
            Back to the outline
          </button>
        </div>
        {/* The lesson's cards and anything missed come back on a schedule;
            this is the moment a reminder is plainly useful. The offer hides
            itself when reminders are on or were declined recently. */}
        <ReminderOffer lead="This lesson comes back on a schedule: its cards when they're due, and a check on anything you missed a couple of days later." />
      </div>,
      "Finished",
      sections.length,
    );
  }

  /* --- One section ------------------------------------------------------ */
  const step = progress?.step;
  const meta = "Learn";
  const next = () => goTo(state.current + 1);
  const yourWay = (explanation: string) =>
    step ? (
      <ExplainYourWay
        materialId={materialId}
        lesson={lesson}
        section={section}
        concept={step.concept}
        explanation={explanation}
        saved={progress?.styled ?? {}}
        onSaved={(style, text) =>
          setState((s) => {
            const current = s.sections[section.key];
            if (!current) return s;
            return {
              ...s,
              sections: {
                ...s.sections,
                [section.key]: { ...current, styled: { ...current.styled, [style]: text } },
              },
            };
          })
        }
      />
    ) : null;

  let body: ReactNode;
  if (showingIntro) {
    /* Part 1 is being written alongside this, so moving on rarely waits. */
    const begin = (
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => setState((s) => ({ ...s, introDone: true }))}>
          Start part 1: {section.title}
        </Button>
      </div>
    );
    body = state.frame ? (
      <TutorTurn variant="card" meta="Before you start · The big picture" check={begin}>
        <AiReply text={state.frame.overview} notes />
      </TutorTurn>
    ) : frameError ? (
      <TutorTurn variant="card" meta="Before you start" check={begin}>
        <p className={styles.note}>
          {frameError} You can start without the overview; it's only the big picture, and every part is still taught in full.
        </p>
        <button type="button" className={styles.quietLink} onClick={() => void writeFrame()}>
          Try the overview again
        </button>
      </TutorTurn>
    ) : (
      <TutorTurn variant="card" meta="Before you start · The big picture" streaming check={begin}>
        <p>Getting the big picture ready…</p>
      </TutorTurn>
    );
  } else if (!step) {
    body =
      error && pending !== section.key ? (
        <AiErrorCard
          detail={error}
          onRetry={() => {
            setError(null);
            void write(state.current);
          }}
          onFallback={() => onOpenTab("notes")}
          fallbackLabel="Read the notes instead"
          kept="Your place in the lesson is kept, and nothing you've answered is lost."
        />
      ) : (
        <TutorTurn variant="card" meta={meta} streaming>
          <p>Getting this part ready…</p>
        </TutorTurn>
      );
  } else if (progress.phase === "hook") {
    const guess = progress.guess;
    body = (
      <TutorTurn variant="card"
        meta="Quick guess"
        check={
          guess === undefined ? (
            <Options question={step.hook} onPick={(i) => patch(section.key, { guess: i })} />
          ) : (
            <div className={styles.results}>
              <p className={styles.result} data-result={guess === step.hook.correctIndex ? "right" : "wrong"}>
                {guess === step.hook.correctIndex ? "✓" : "✕"} Your guess: {step.hook.choices[guess]}
              </p>
              {guess !== step.hook.correctIndex ? (
                <p className={styles.result} data-result="right">
                  ✓ Answer: {step.hook.choices[step.hook.correctIndex]}
                </p>
              ) : null}
              <Button variant="primary" onClick={() => patch(section.key, { phase: "teach" })}>
                Show me why
              </Button>
            </div>
          )
        }
      >
        <p className={styles.question}>{step.hook.question}</p>
        {guess === undefined ? (
          <p className={styles.note}>Before you're taught it: what do you think? Guessing wrong here costs nothing.</p>
        ) : null}
      </TutorTurn>
    );
  } else if (progress.phase === "teach") {
    body = (
      <TutorTurn variant="card"
        meta={meta}
        claim={step.concept}
        claimLevel={2}
        deeper={<AiReply text={section.body} diagrams={false} notes />}
        check={
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => patch(section.key, { phase: "check" })}>
              Got it, check me
            </Button>
          </div>
        }
      >
        <AiReply text={step.explanation} notes />
        {step.hook.feedback ? (
          <p className={styles.note}>Back to your guess: {step.hook.feedback}</p>
        ) : null}
        {yourWay(step.explanation)}
      </TutorTurn>
    );
  } else if (progress.phase === "check" || progress.phase === "recheck") {
    const which = progress.phase;
    const question = which === "check" ? step.check : step.recheck;
    const picked = progress[which];
    const right = picked === question.correctIndex;
    body = (
      <TutorTurn variant="card"
        meta={which === "check" ? "Check" : "One more check"}
        check={
          picked === undefined ? (
            <Options question={question} onPick={(i) => answer(which, i)} />
          ) : (
            <div className={styles.results} aria-live="polite">
              <p className={styles.result} data-result={right ? "right" : "wrong"}>
                {right ? "✓ Right." : `✕ Not this time. The answer is ${question.choices[question.correctIndex]}.`}
              </p>
              {question.feedback ? (
                <div className={styles.feedback}>
                  <AiReply text={question.feedback} diagrams={false} />
                </div>
              ) : null}
              {!right && which === "check" ? (
                <>
                  <p className={styles.note}>That's a useful miss. Here's the same idea from a different angle.</p>
                  <Button variant="primary" onClick={() => patch(section.key, { phase: "reteach" })}>
                    Explain it another way
                  </Button>
                </>
              ) : (
                <>
                  {!right ? (
                    <p className={styles.note}>
                      Saved to your mistakes, so it comes back until it sticks. You can learn this part again at the end.
                    </p>
                  ) : null}
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        patch(section.key, { phase: "done" });
                        next();
                      }}
                    >
                      {state.current + 1 < sections.length ? "Next part" : "Finish the lesson"}
                    </Button>
                    <ExamOffer onStart={() => patch(section.key, { phase: "exam" })} />
                  </div>
                </>
              )}
            </div>
          )
        }
      >
        <p className={styles.question}>{question.question}</p>
      </TutorTurn>
    );
  } else if (progress.phase === "reteach") {
    body = (
      <TutorTurn variant="card"
        meta="Another way"
        claim={step.concept}
        claimLevel={2}
        check={
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => patch(section.key, { phase: "recheck" })}>
              Try a new question
            </Button>
          </div>
        }
      >
        <AiReply text={step.reteach} notes />
        {yourWay(step.reteach)}
      </TutorTurn>
    );
  } else if (progress.phase === "exam") {
    body = (
      <ProGate feature="learnExam" loadingHeight={220}>
        <ExamPart
          key={progress.exam?.question.question ?? "new"}
          meta="Exam question"
          materialId={materialId}
          lesson={lesson}
          subject={subject}
          section={section}
          concept={step.concept}
          saved={progress.exam}
          onSave={(exam) => patch(section.key, { exam })}
          onAnother={() => patch(section.key, { exam: undefined })}
          onNext={() => {
            patch(section.key, { phase: "done" });
            next();
          }}
          nextLabel={state.current + 1 < sections.length ? "Next part" : "Finish the lesson"}
        />
      </ProGate>
    );
  } else {
    body = (
      <TutorTurn variant="card"
        meta={meta}
        claim={step.concept}
        claimLevel={2}
        check={
          <div className={styles.actions}>
            <Button variant="primary" onClick={next}>
              {state.current + 1 < sections.length ? "Next part" : "Finish the lesson"}
            </Button>
            {progress.outcome === "revisit" ? (
              <Button variant="secondary" onClick={() => learnAgain(section.key)}>
                Learn this part again
              </Button>
            ) : null}
            <ExamOffer
              label={progress.exam?.marking ? "See your exam answer" : undefined}
              onStart={() => patch(section.key, { phase: "exam" })}
            />
          </div>
        }
      >
        <p className={styles.note}>{progress.outcome ? OUTCOME_LABEL[progress.outcome] : "Done"}.</p>
        <AiReply text={step.explanation} notes />
      </TutorTurn>
    );
  }

  return focusFrame(
    /* Worked examples are uncovered a step at a time here. */
    <RevealSteps.Provider value>{body}</RevealSteps.Provider>,
    showingIntro ? "Before you start" : `Part ${state.current + 1} of ${sections.length} · ${section.title}`,
    state.current,
  );
}

/* The page while learning: a slim bar with the way out, where you are and
   the other ways to learn; a progress strip; then the one step. */
function FocusFrame({
  title,
  sub,
  sections,
  state,
  progressIndex,
  mode,
  onExit,
  onMode,
  children,
}: {
  title: string;
  sub: string;
  sections: LearnSection[];
  state: LearnState;
  /** The part being shown; null hides the strip (podcast, call). */
  progressIndex: number | null;
  mode: Mode;
  onExit: () => void;
  onMode: (mode: Mode) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.focus}>
      <header className={styles.focusBar}>
        <button type="button" className={styles.exit} onClick={onExit} aria-label="Leave and go back to the lesson">
          <Icon name="x" size={18} />
        </button>
        <div className={styles.focusTitle}>
          <span className={styles.focusLesson}>{title}</span>
          <span className={styles.focusSub}>{sub}</span>
        </div>
        <div className={styles.focusTools} role="group" aria-label="Ways to learn">
          <button type="button" className={styles.tool} aria-pressed={mode === "steps"} onClick={() => onMode("steps")}>
            <Icon name="book-open" size={16} />
            <span>Steps</span>
          </button>
          <button type="button" className={styles.tool} aria-pressed={mode === "listen"} onClick={() => onMode("listen")}>
            <Icon name="headphones" size={16} />
            <span>Listen</span>
          </button>
          <button type="button" className={styles.tool} aria-pressed={mode === "call"} onClick={() => onMode("call")}>
            <Icon name="phone" size={16} />
            <span>Call</span>
          </button>
        </div>
      </header>
      {progressIndex !== null ? (
        <div
          className={styles.strip}
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={sections.length}
          aria-valuenow={sections.filter((s) => state.sections[s.key]?.outcome).length}
          aria-valuetext={`Part ${Math.min(progressIndex + 1, sections.length)} of ${sections.length}`}
        >
          {sections.map((s, i) => (
            <span
              key={s.key}
              title={s.title}
              data-done={state.sections[s.key]?.outcome ? true : undefined}
              data-current={i === progressIndex || undefined}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.stage}>{children}</div>
    </div>
  );
}

/* Plus: "Explain it another way", in the style the student thinks in. Shown
   to everyone, so free students can see it exists; a free click opens the
   plans rather than doing nothing. Each style is written once per part and
   kept, so switching back and forth costs nothing. */
function ExplainYourWay({
  materialId,
  lesson,
  section,
  concept,
  explanation,
  saved,
  onSaved,
}: {
  materialId: string;
  lesson: string;
  section: LearnSection;
  concept: string;
  explanation: string;
  saved: Partial<Record<LearnStyle, string>>;
  onSaved: (style: LearnStyle, text: string) => void;
}) {
  const { guard, paywall } = useProAction("learnStyles");
  const { can, isPending } = useEntitlements();
  const [shown, setShown] = useState<LearnStyle | null>(null);
  const [writing, setWriting] = useState<LearnStyle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (style: LearnStyle) => {
    if (!guard()) return;
    setShown(style);
    /* Which way of explaining they reach for (lib/learnerSignals.ts). */
    void learnerSignalsApi.record({
      kind: "reteach_pick",
      surface: "learn",
      value: style,
      ref: `${materialId}:${section.key}`,
      clientId: `reteach-pick:${materialId}:${section.key}:${style}`,
    });
    setError(null);
    if (saved[style] || writing) return;
    setWriting(style);
    try {
      onSaved(style, await explainAnotherWay({ materialId, lesson, section, concept, explanation, style }));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "That didn't work. Try again.");
    } finally {
      setWriting(null);
    }
  };

  const text = shown ? saved[shown] : undefined;
  return (
    <div className={styles.yourWay}>
      <p className={styles.yourWayLabel}>
        Explain it another way
        {!isPending && !can("learnStyles") ? <span className={styles.plusTag}>Plus</span> : null}
      </p>
      <div className={styles.chips} role="group" aria-label="Explain it another way">
        {LEARN_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            className={styles.chip}
            aria-pressed={shown === style}
            disabled={writing !== null && writing !== style}
            onClick={() => void pick(style)}
          >
            {LEARN_STYLE_LABELS[style]}
          </button>
        ))}
      </div>
      {writing ? (
        <p className={styles.note} role="status">
          Writing it as {LEARN_STYLE_LABELS[writing].toLowerCase()}…
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {text ? (
        <div className={styles.styled} aria-live="polite">
          <AiReply text={text} notes />
        </div>
      ) : null}
      {paywall}
    </div>
  );
}

/* Plus: the way into a part's exam question. Shown to everyone, tagged for
   free students, whose click opens the plans. */
function ExamOffer({ onStart, label }: { onStart: () => void; label?: string }) {
  const { guard, paywall } = useProAction("learnExam");
  const { can, isPending } = useEntitlements();
  return (
    <>
      <Button variant="secondary" onClick={() => guard() && onStart()}>
        {label ?? "Try an exam question"}
        {!isPending && !can("learnExam") ? <span className={styles.plusTag}>Plus</span> : null}
      </Button>
      {paywall}
    </>
  );
}

interface ExamProgress {
  question: ExamQuestion;
  answer?: string;
  marking?: Marking;
}

/* One exam question on a part just learned, written and then marked. The
   score is counted by the app from the points, and each awarded point shows
   the student's own words that earned it (api/learn.ts holdToAnswer). Wrong
   beliefs the answer states go to the ledger; a missing point does not. */
function ExamPart({
  meta,
  materialId,
  lesson,
  subject,
  section,
  concept,
  saved,
  onSave,
  onAnother,
  onNext,
  nextLabel,
}: {
  meta: string;
  materialId: string;
  lesson: string;
  subject: string | null;
  section: LearnSection;
  concept: string;
  saved: ExamProgress | undefined;
  onSave: (exam: ExamProgress) => void;
  onAnother: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const [draft, setDraft] = useState(saved?.answer ?? "");
  const [busy, setBusy] = useState<"writing" | "marking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const write = useCallback(async () => {
    setBusy("writing");
    setError(null);
    try {
      onSave({ question: await writeExamQuestion({ materialId, lesson, section, concept }) });
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "The tutor didn't answer.");
    } finally {
      setBusy(null);
    }
  }, [materialId, lesson, section, concept, onSave]);

  useEffect(() => {
    if (saved?.question || started.current) return;
    started.current = true;
    void write();
  }, [saved?.question, write]);

  const mark = async () => {
    const exam = saved?.question;
    const answer = draft.trim();
    if (!exam || !answer) return;
    setBusy("marking");
    setError(null);
    try {
      const marking = await markTypedAnswer({
        materialId,
        lesson,
        exam,
        answer,
        subject: subject || "General",
      });
      onSave({ question: exam, answer, marking });
      if (marking.kind === "marked") {
        const runId = `learn-exam:${materialId}:${section.key}:${questionHash(exam.question)}`;
        void learningEventsApi
          .record(
            {
              source: "quick_check",
              topicKey: normaliseTopicKey(lesson),
              /* A score with unchecked points is only a floor: not evidence
                 of how well it's known. */
              score: marking.unchecked ? null : marking.awarded / marking.total,
              clientId: runId,
              payload: { mode: "learn-exam", concept, section: section.title, materialId },
            },
            candidatesFromMarking(marking, subject || "General", runId),
          )
          .catch(() => {
            /* Best-effort, like every other evidence write. */
          });
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "The marker didn't answer.");
    } finally {
      setBusy(null);
    }
  };

  if (!saved?.question) {
    return error ? (
      <AiErrorCard
        detail={error}
        onRetry={() => void write()}
        onFallback={onNext}
        fallbackLabel="Skip it"
        kept="Your place in the lesson is kept."
      />
    ) : (
      <TutorTurn variant="card" meta={meta} streaming>
        <p>Writing an exam question on {concept}…</p>
      </TutorTurn>
    );
  }

  const { question: exam, marking } = saved;
  const marks = `${exam.total} mark${exam.total === 1 ? "" : "s"}`;
  return (
    <TutorTurn variant="card"
      meta={meta}
      check={
        marking && marking.kind === "marked" ? (
          <div className={styles.results} aria-live="polite">
            <p className={styles.result} data-result={marking.awarded === marking.total ? "right" : "wrong"}>
              {marking.unchecked ? "At least " : ""}
              {marking.awarded} of {marking.total} marks.
            </p>
            <ul className={styles.points} aria-label="Mark scheme">
              {marking.points.map((p, i) => (
                <li key={i} data-verdict={p.verdict}>
                  <span className={styles.pointMark} aria-hidden="true">
                    {p.verdict === "awarded" ? "✓" : p.verdict === "missed" ? "✕" : "?"}
                  </span>
                  <span>
                    <span className={styles.srOnly}>
                      {p.verdict === "awarded" ? "Earned: " : p.verdict === "missed" ? "Missed: " : "Not checked: "}
                    </span>
                    {p.point.text}
                    {p.point.marks > 1 ? ` (${p.point.marks})` : ""}
                    {p.verdict === "awarded" ? (
                      <span className={styles.pointNote}>Your words: “{p.evidence}”</span>
                    ) : p.note ? (
                      <span className={styles.pointNote}>{p.note}</span>
                    ) : p.verdict === "unchecked" ? (
                      <span className={styles.pointNote}>The marker didn't check this one.</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {marking.beliefs.length ? (
              <p className={styles.note}>
                Saved to your mistakes: {marking.beliefs.map((b) => b.belief).join("; ")}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button variant="primary" onClick={onNext}>
                {nextLabel}
              </Button>
              <Button variant="secondary" onClick={onAnother}>
                Try another question
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.examForm}>
            <textarea
              className={styles.answer}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your answer as you would in the exam."
              aria-label="Your answer"
              rows={5}
              disabled={busy !== null}
            />
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button variant="primary" busy={busy === "marking"} disabled={!draft.trim()} onClick={() => void mark()}>
                {busy === "marking" ? "Marking" : "Mark my answer"}
              </Button>
              <button type="button" className={styles.quietLink} onClick={onNext}>
                Skip it
              </button>
            </div>
          </div>
        )
      }
    >
      <p>
        {exam.question} <span className={styles.marks}>[{marks}]</span>
      </p>
    </TutorTurn>
  );
}

function Outline({
  sections,
  state,
  onPick,
}: {
  sections: LearnSection[];
  state: LearnState;
  onPick: (index: number) => void;
}) {
  return (
    <ol className={styles.outline} aria-label="Parts of this lesson">
      {sections.map((s, i) => {
        const outcome = state.sections[s.key]?.outcome;
        return (
          <li key={s.key}>
            <button type="button" className={styles.part} onClick={() => onPick(i)}>
              <span className={styles.partNumber} data-outcome={outcome} aria-hidden="true">
                {outcome === "revisit" ? "!" : outcome ? "✓" : i + 1}
              </span>
              <span className={styles.partTitle}>{s.title}</span>
              {outcome ? <span className={styles.partMeta}>{OUTCOME_LABEL[outcome]}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Options({ question, onPick }: { question: QuizQuestion; onPick: (index: number) => void }) {
  /* 1-4 or A-D picks a choice, unless the student is typing somewhere. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toUpperCase();
      const index = /^[1-9]$/.test(key) ? Number(key) - 1 : KEYS.indexOf(key);
      if (index >= 0 && index < question.choices.length) {
        event.preventDefault();
        onPick(index);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [question, onPick]);
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
