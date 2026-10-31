import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { AiErrorCard } from "../../components/learning/AiErrorCard";
import { TutorTurn } from "../../components/learning/TutorTurn";
import { AiReply } from "../../components/chat/AiReply";
import {
  explainAnotherWay,
  generateLearnStep,
  LEARN_STYLE_LABELS,
  LEARN_STYLES,
  markTypedAnswer,
  writeExamQuestion,
  type ExamQuestion,
  type LearnStep,
  type LearnStyle,
} from "../../api/learn";
import { ProGate, useProAction } from "../../components/ProGate";
import { candidatesFromMarking, type Marking } from "../../lib/photoMarking";
import { useEntitlements } from "../../hooks/useSubscription";
import { learningEventsApi } from "../../api/learningEvents";
import { learnSections, type LearnSection } from "../../lib/learnSections";
import { normaliseTopicKey } from "../../lib/topicKey";
import type { QuizQuestion } from "../../lib/aiJson";
import type { MisconceptionCandidate } from "../../lib/misconceptions";
import styles from "./learn.module.css";

/* Learn: the lesson taught, one section of its notes at a time.
 *
 * Every other tab assumes the student already knows the material and tests
 * or drills it. This one teaches it first. Each section goes: guess at a
 * question before being told (so the answer has something to attach to),
 * the idea taught from this lesson's notes, a check on that idea, and, on a
 * miss, the same idea taught another way with a different check.
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
const storageKey = (materialId: string) => `learnora:learn:v1:${materialId}`;

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
  lesson,
  subject,
  markdown,
  loading,
  onOpenTab,
}: {
  materialId: string;
  /** What the lesson is about, for the prompt and the evidence's topic. */
  lesson: string;
  subject: string | null;
  markdown: string;
  loading: boolean;
  onOpenTab: (tab: "notes" | "cards" | "quiz") => void;
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
      lesson={lesson}
      subject={subject}
      sections={sections}
      outline={outline}
      onOpenTab={onOpenTab}
    />
  );
}

function LearnFlow({
  materialId,
  lesson,
  subject,
  sections,
  outline,
  onOpenTab,
}: {
  materialId: string;
  lesson: string;
  subject: string | null;
  sections: LearnSection[];
  outline: string[];
  onOpenTab: (tab: "notes" | "cards" | "quiz") => void;
}) {
  const [state, setState] = useState<LearnState>(() => loadState(materialId, outline));
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
    [sections, materialId, lesson, titles],
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

  const goTo = (index: number) => {
    setError(null);
    setState((s) => ({ ...s, current: index }));
  };

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
              summary: question.feedback || step.explanation.slice(0, 280),
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
    setState(freshState(outline));
  };

  /* --- The outline ------------------------------------------------------ */
  if (state.current < 0) {
    const started = sections.some((s) => state.sections[s.key]?.guess !== undefined);
    const resumeAt = sections.findIndex((s) => !state.sections[s.key]?.outcome);
    return (
      <div className={styles.flow}>
        <div className={styles.intro}>
          <h2 className={styles.introTitle}>Learn this lesson</h2>
          <p className={styles.lead}>
            {sections.length === 1
              ? "One part, taught from your notes: a quick guess, the idea, then a check."
              : `${sections.length} parts, taught from your notes one at a time: a quick guess, the idea, then a check. Miss a check and it's explained another way.`}
          </p>
        </div>
        <Outline sections={sections} state={state} onPick={goTo} />
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => goTo(resumeAt === -1 ? sections.length : resumeAt)}>
            {!started ? "Start learning" : resumeAt === -1 ? "See how it went" : `Carry on: ${sections[resumeAt].title}`}
          </Button>
          {started ? (
            <button type="button" className={styles.quietLink} onClick={startOver}>
              Start over
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  /* --- The end ---------------------------------------------------------- */
  if (!section) {
    const revisit = sections.filter((s) => state.sections[s.key]?.outcome === "revisit");
    const skipped = sections.filter((s) => !state.sections[s.key]?.outcome);
    const learned = sections.length - revisit.length - skipped.length;
    return (
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
      </div>
    );
  }

  /* --- One section ------------------------------------------------------ */
  const step = progress?.step;
  const meta = `Part ${state.current + 1} of ${sections.length} · ${section.title}`;
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
  if (!step) {
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
        <TutorTurn meta={meta} streaming>
          <p>Getting this part ready…</p>
        </TutorTurn>
      );
  } else if (progress.phase === "hook") {
    const guess = progress.guess;
    body = (
      <TutorTurn
        meta={`${meta} · Quick guess`}
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
        <p>{step.hook.question}</p>
        {guess === undefined ? (
          <p className={styles.note}>Before you're taught it: what do you think? Guessing wrong here costs nothing.</p>
        ) : null}
      </TutorTurn>
    );
  } else if (progress.phase === "teach") {
    body = (
      <TutorTurn
        meta={meta}
        claim={step.concept}
        claimLevel={2}
        deeper={<AiReply text={section.body} diagrams={false} />}
        check={
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => patch(section.key, { phase: "check" })}>
              Got it, check me
            </Button>
          </div>
        }
      >
        <AiReply text={step.explanation} />
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
      <TutorTurn
        meta={which === "check" ? `${meta} · Check` : `${meta} · One more check`}
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
        <p>{question.question}</p>
      </TutorTurn>
    );
  } else if (progress.phase === "reteach") {
    body = (
      <TutorTurn
        meta={`${meta} · Another way`}
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
        <AiReply text={step.reteach} />
        {yourWay(step.reteach)}
      </TutorTurn>
    );
  } else if (progress.phase === "exam") {
    body = (
      <ProGate feature="learnExam" loadingHeight={220}>
        <ExamPart
          key={progress.exam?.question.question ?? "new"}
          meta={`${meta} · Exam question`}
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
      <TutorTurn
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
        <AiReply text={step.explanation} />
      </TutorTurn>
    );
  }

  return (
    <div className={styles.flow}>
      <div className={styles.bar}>
        <button type="button" className={styles.quietLink} onClick={() => goTo(-1)}>
          ← Outline
        </button>
        <div
          className={styles.segments}
          role="img"
          aria-label={`Part ${state.current + 1} of ${sections.length}`}
        >
          {sections.map((s, i) => (
            <span
              key={s.key}
              data-done={state.sections[s.key]?.outcome ? true : undefined}
              data-current={i === state.current || undefined}
            />
          ))}
        </div>
      </div>
      {body}
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
          <AiReply text={text} />
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
      <TutorTurn meta={meta} streaming>
        <p>Writing an exam question on {concept}…</p>
      </TutorTurn>
    );
  }

  const { question: exam, marking } = saved;
  const marks = `${exam.total} mark${exam.total === 1 ? "" : "s"}`;
  return (
    <TutorTurn
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
