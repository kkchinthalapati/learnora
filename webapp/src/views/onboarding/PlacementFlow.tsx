import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { fetchBankQuestions } from "../../api/questionBank";
import { defaultTier, type SyllabusSpec } from "../../lib/syllabus";
import { localDateStr } from "../../lib/date";
import { boardOptions, GROUP_LABELS, type BoardOption } from "./boards";
import {
  PLACEMENT_MIN,
  pickPlacement,
  startingPointFromAnswers,
  startingPointFromChapters,
  type ChapterSure,
  type PlacementAnswer,
  type PlacementQuestion,
  type StartingPoint,
  TODAY_MINUTES,
} from "./placement";
import text from "../../styles/text.module.css";
import styles from "./firstRun.module.css";

const KEYS = ["A", "B", "C", "D", "E"];

/* ---- 1. Board picker ------------------------------------------------- */

export function BoardPicker({
  headingRef,
  firstName,
  onPick,
  onTopicInstead,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  firstName: string | null;
  onPick: (board: BoardOption) => void;
  onTopicInstead: () => void;
}) {
  const options = useMemo(() => boardOptions(), []);
  const [picked, setPicked] = useState<string | null>(null);
  const board = options.find((o) => o.id === picked) ?? null;
  const groups = (["GCSE", "IB", "India", "Other"] as const).map((g) => ({
    g,
    items: options.filter((o) => o.group === g),
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (board) onPick(board);
  };

  return (
    <main className={styles.flow}>
      <form className={styles.flowColumn} onSubmit={submit}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.flowHeading}>
          {firstName
            ? `${firstName}, what are you studying for?`
            : "What are you studying for?"}
        </h1>
        <p className={styles.sub}>
          So the questions match your exam. Each one says how ready Learnora is
          for it.
        </p>
        {groups.map(({ g, items }) => (
          <fieldset key={g} className={styles.boardGroup}>
            <legend className={styles.boardLegend}>{GROUP_LABELS[g]}</legend>
            {items.map((o) => (
              <label
                key={o.id}
                className={styles.boardRow}
                data-picked={picked === o.id || undefined}
              >
                <input
                  type="radio"
                  name="board"
                  value={o.id}
                  checked={picked === o.id}
                  onChange={() => setPicked(o.id)}
                  className={styles.boardRadio}
                />
                <span className={styles.boardLabel}>{o.label}</span>
                {o.support === "ready" ? (
                  <span className={styles.ready}>Ready</span>
                ) : o.support === "partly" ? (
                  <span className={styles.partly}>Partly ready</span>
                ) : null}
                {picked === o.id && o.honesty ? (
                  <span className={styles.honesty}>{o.honesty}</span>
                ) : null}
              </label>
            ))}
          </fieldset>
        ))}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          aria-disabled={!board || undefined}
        >
          Continue
        </Button>
        <button
          type="button"
          className={styles.skipLink}
          onClick={onTopicInstead}
        >
          Start from one topic instead
        </button>
      </form>
    </main>
  );
}

/* ---- 2a. The 2-minute check, from the bank ---------------------------- */

type Load =
  | { state: "loading" }
  | { state: "ready"; questions: PlacementQuestion[] }
  | { state: "fallback" };

export function PlacementCheck({
  spec,
  headingRef,
  onAnswer,
  onDone,
}: {
  spec: SyllabusSpec;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Each real answer, for the evidence ledger. Not called for "not learnt". */
  onAnswer: (q: PlacementQuestion, correct: boolean) => void;
  onDone: (sp: StartingPoint) => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [index, setIndex] = useState(0);
  const answers = useRef<PlacementAnswer[]>([]);

  useEffect(() => {
    let live = true;
    fetchBankQuestions(
      spec,
      spec.topics.map((t) => t.ref),
      defaultTier(spec),
    )
      .then((rows) => {
        if (!live) return;
        const questions = pickPlacement(spec, rows);
        setLoad(
          questions.length >= PLACEMENT_MIN
            ? { state: "ready", questions }
            : { state: "fallback" },
        );
      })
      .catch(() => live && setLoad({ state: "fallback" }));
    return () => {
      live = false;
    };
  }, [spec]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index, load.state, headingRef]);

  if (load.state === "fallback") {
    return <ChapterCheck spec={spec} headingRef={headingRef} onDone={onDone} />;
  }

  if (load.state === "loading") {
    return (
      <main className={styles.flow}>
        <div className={styles.flowColumn} aria-busy="true">
          <h1 ref={headingRef} tabIndex={-1} className={styles.srOnly}>
            Getting your 2-minute check ready
          </h1>
          <Skeleton
            label="Getting your 2-minute check ready"
            width="40%"
            height={14}
          />
          <Skeleton width="90%" height={28} radius="6px" />
          <Skeleton height={54} radius="var(--radius-md)" />
          <Skeleton height={54} radius="var(--radius-md)" />
          <Skeleton height={54} radius="var(--radius-md)" />
        </div>
      </main>
    );
  }

  const { questions } = load;
  const q = questions[index];
  const advance = (answer: PlacementAnswer) => {
    answers.current = [...answers.current, answer];
    if (index + 1 >= questions.length)
      onDone(startingPointFromAnswers(answers.current));
    else setIndex(index + 1);
  };
  const pick = (i: number) => {
    const correct = i === q.correctIndex;
    onAnswer(q, correct);
    advance({ topicTitle: q.topicTitle, correct });
  };

  return (
    <main className={styles.flow}>
      <div className={styles.flowColumn}>
        <div className={styles.checkHead}>
          <span className={text.meta}>
            2-minute check · {index + 1} of {questions.length}
          </span>
          <ol className={styles.checkSegments} aria-hidden="true">
            {questions.map((_, i) => (
              <li
                key={i}
                data-done={i < index || undefined}
                data-current={i === index || undefined}
              />
            ))}
          </ol>
        </div>
        <p className={styles.checkTopic}>{q.topicTitle}</p>
        <h1 ref={headingRef} tabIndex={-1} className={styles.checkQuestion}>
          {q.question}
        </h1>
        <ul className={styles.options} aria-label="Choices">
          {q.choices.map((choice, i) => (
            <li key={`${index}-${i}`}>
              <button
                type="button"
                className={styles.option}
                onClick={() => pick(i)}
              >
                <span className={styles.key} aria-hidden="true">
                  {KEYS[i]}
                </span>
                {choice}
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          onClick={() => advance({ topicTitle: q.topicTitle, correct: null })}
        >
          I haven’t learnt this yet
        </Button>
        <p className={styles.note}>
          No marks and no score. It just shows us where to start. Questions from
          the {spec.board} question bank.
        </p>
      </div>
    </main>
  );
}

/* ---- 2b. Per chapter, for partly-ready boards (no AI wait) ------------- */

const SURE: { id: ChapterSure; label: string }[] = [
  { id: "know", label: "I know this" },
  { id: "unsure", label: "Not sure" },
  { id: "not_learnt", label: "Not learnt yet" },
];

export function ChapterCheck({
  spec,
  headingRef,
  onDone,
}: {
  spec: SyllabusSpec;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onDone: (sp: StartingPoint) => void;
}) {
  const [sure, setSure] = useState<Record<string, ChapterSure>>({});
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
  return (
    <main className={styles.flow}>
      <form
        className={styles.flowColumn}
        onSubmit={(e) => {
          e.preventDefault();
          onDone(startingPointFromChapters(spec, sure));
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className={styles.flowHeading}>
          How sure are you about each chapter?
        </h1>
        <p className={styles.sub}>
          Tap one for each, or leave any you’re not sure about. This is your own
          view, so it shapes the plan but never counts as a result.
        </p>
        {spec.units.map((u) => (
          <fieldset key={u.code} className={styles.chapter}>
            <legend className={styles.chapterTitle}>{u.title}</legend>
            <div className={styles.chips}>
              {SURE.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={sure[u.code] === s.id}
                  onClick={() =>
                    setSure((prev) => {
                      const next = { ...prev };
                      if (next[u.code] === s.id) delete next[u.code];
                      else next[u.code] = s.id;
                      return next;
                    })
                  }
                >
                  {sure[u.code] === s.id ? (
                    <span aria-hidden="true">✓ </span>
                  ) : null}
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <Button type="submit" variant="primary" size="lg">
          See where I’m starting
        </Button>
      </form>
    </main>
  );
}

/* ---- 3. Here's where you're starting ------------------------------------ */

export interface StartChoice {
  paperName: string | null;
  examDate: string;
  minutes: (typeof TODAY_MINUTES)[number];
}

export function StartingPointView({
  spec,
  sp,
  headingRef,
  busy,
  onStart,
}: {
  spec: SyllabusSpec | null;
  sp: StartingPoint;
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onStart: (choice: StartChoice) => void;
}) {
  const tier = spec ? defaultTier(spec) : null;
  const papers = spec
    ? spec.papers.filter((p) => !p.tier || p.tier === tier)
    : [];
  const [paperName, setPaperName] = useState<string | null>(
    papers[0]?.name ?? null,
  );
  const [examDate, setExamDate] = useState("");
  const [minutes, setMinutes] = useState<StartChoice["minutes"]>(10);
  const nothing = sp.know.length + sp.look.length + sp.notLearnt.length === 0;

  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);

  const group = (
    title: string,
    items: string[],
    tone: "know" | "look" | "not",
  ) =>
    items.length ? (
      <section className={styles.spGroup} data-tone={tone} aria-label={title}>
        <h2 className={styles.spTitle}>{title}</h2>
        <ul className={styles.spList}>
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <main className={styles.flow}>
      <form
        className={styles.flowColumn}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onStart({ paperName, examDate, minutes });
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className={styles.flowHeading}>
          Here’s where you’re starting.
        </h1>
        {nothing ? (
          <p className={styles.sub}>
            Nothing to go on yet, and that’s fine. Your first practice will show
            us more.
          </p>
        ) : (
          <div className={styles.spGroups}>
            {group("You know this", sp.know, "know")}
            {group("Worth a look first", sp.look, "look")}
            {group("Not learnt yet, and that’s fine", sp.notLearnt, "not")}
          </div>
        )}

        {papers.length > 0 ? (
          <fieldset className={styles.field}>
            <legend className={styles.fieldLabel}>Which paper is next?</legend>
            <div className={styles.chips}>
              {papers.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={styles.chip}
                  aria-pressed={paperName === p.name}
                  onClick={() => setPaperName(p.name)}
                >
                  {p.name} · {p.minutes} min
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        {spec ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>When is it? (optional)</span>
            <input
              type="date"
              className={styles.dateInput}
              value={examDate}
              min={localDateStr()}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
        ) : null}
        <fieldset className={styles.field}>
          <legend className={styles.fieldLabel}>
            How long have you got today?
          </legend>
          <div className={styles.chips}>
            {TODAY_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                className={styles.chip}
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="primary" size="lg" busy={busy}>
          {busy ? "Starting" : `Start · ${minutes} min`}
        </Button>
      </form>
    </main>
  );
}
