import { useEffect, useMemo, useState } from "react";
import { learningEventsApi } from "../../../api/learningEvents";
import { normaliseTopicKey } from "../../../lib/topicKey";
import { Button } from "../../../components/Button";
import { ConfidencePicker } from "../../../components/learning/ConfidencePicker";
import type { Confidence } from "../../../components/learning/options";
import { generateQuizQuestions } from "../../../api/aiQuiz";
import { bankPracticeFor } from "../../../api/questionBank";
import { askInSession, buildSessionContext } from "../../../api/aiSession";
import { TutorTurn } from "../../../components/learning/TutorTurn";
import { useMisconceptions, useRecordMisconceptions } from "../../../hooks/useMisconceptions";
import { useSettings } from "../../../context/settings";
import type { QuizQuestion } from "../../../lib/aiJson";
import { fenceUntrusted } from "../../../lib/actionTags";
import { candidatesFromQuizAnswers } from "../../../lib/misconceptions";
import { Pending } from "../Pending";
import { SessionComposer } from "../SessionComposer";
import { useAiTask } from "../useAiTask";
import type { ModeProps } from "../modeTypes";
import text from "../../../styles/text.module.css";
import styles from "../session.module.css";

export const PRACTICE_PROBLEMS = 6;
/** Fewer bank questions than this is not a practice set; the AI's error
 *  is shown instead. */
const MIN_BANK_PROBLEMS = 3;
/** Exam traps: the Practice preset with a clock. */
export const TRAPS_MINUTES = 10;

const KEYS = ["A", "B", "C", "D", "E"];

export interface PracticeAnswer {
  chosen: number;
  correct: boolean;
  confidence: Confidence | null;
}

export interface PracticeData {
  questions?: QuizQuestion[];
  /** Topics mixed in with the objective, for the meta line. */
  mixedWith: string[];
  answers: Record<number, PracticeAnswer>;
  /** Wrong options struck out by "Hint", per problem. */
  struck: Record<number, number[]>;
  /** Exam-traps deadline (epoch ms). */
  endsAt?: number;
}

/* Practice: interleaved problems, answered, rated for confidence, then
   checked. Mixing topics is harder in the moment and is what makes it hold
   on the exam (Rohrer et al., 2020), so up to two other open trouble spots
   from the ledger are mixed in with the objective. */
export function PracticeMode({ session, ctl, onFlag, onSwitchMode }: ModeProps) {
  const { settings } = useSettings();
  const { ranked } = useMisconceptions();
  const record = useRecordMisconceptions();
  const task = useAiTask();
  const data = useMemo<PracticeData>(
    () => ({
      mixedWith: [],
      answers: {},
      struck: {},
      ...((session.data.practice as PracticeData | undefined) ?? {}),
    }),
    [session.data.practice],
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /* A question asked about the problem, and the tutor's hint back. Not
     persisted: it belongs to this attempt at this problem. */
  const [aside, setAside] = useState<{ q: string; a?: string } | null>(null);

  const traps = session.preset === "traps";

  const generate = () => {
    const mixedWith = ranked
      .map((m) => m.concept)
      .filter((c) => c.toLowerCase() !== session.objective.toLowerCase())
      .slice(0, 2);
    task.run(
      () =>
        /* When the AI can't write problems (an outage, or today's allowance
           is used up), practice still runs: the question bank has exam-style
           questions on the spec topic this objective maps to. */
        generateQuizQuestions({
          sourceText: `Topic: ${fenceUntrusted(session.objective)}${
            mixedWith.length
              ? `\nInterleave about a third of the problems with these related topics: ${mixedWith
                  .map((t) => fenceUntrusted(t))
                  .join("; ")}.`
              : ""
          }${traps ? "\nWrite exam-style questions whose wrong options are the traps examiners set." : ""}`,
          topic: fenceUntrusted(session.objective),
          settings,
          options: { questionCount: PRACTICE_PROBLEMS },
        }).catch(async (err) => {
          const fromBank = await bankPracticeFor(
            [session.subject, session.objective].filter(Boolean).join(" "),
            PRACTICE_PROBLEMS,
          ).catch(() => null);
          if (fromBank && fromBank.length >= MIN_BANK_PROBLEMS) return fromBank;
          throw err;
        }),
      (questions) => {
        ctl.update((s) => ({
          ...s,
          plan: questions.map((q, i) => ({
            id: `p${i + 1}`,
            label: q.topic ? `Problem ${i + 1} · ${q.topic}` : `Problem ${i + 1}`,
          })),
          currentStep: 0,
          data: {
            ...s.data,
            practice: {
              questions,
              mixedWith,
              answers: {},
              struck: {},
              endsAt: traps ? Date.now() + (s.minutes ?? TRAPS_MINUTES) * 60_000 : undefined,
            },
          },
        }));
      },
    );
  };

  useEffect(() => {
    if (!data.questions) task.once("generate", generate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The clock only exists for Exam traps. */
  useEffect(() => {
    if (!data.endsAt || session.status === "done") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data.endsAt, session.status]);

  const index = session.currentStep;
  const question = data.questions?.[index];
  const answer = data.answers[index];
  const done = session.status === "done" || (data.questions && index >= data.questions.length);
  const secondsLeft = data.endsAt ? Math.max(0, Math.round((data.endsAt - now) / 1000)) : null;

  useEffect(() => {
    if (secondsLeft === 0 && session.status !== "done") ctl.finish();
  }, [secondsLeft, session.status, ctl]);

  const check = () => {
    if (!question || chosen === null) return;
    const correct = chosen === question.correctIndex;
    const answers = { ...data.answers, [index]: { chosen, correct, confidence } };
    ctl.setModeData<PracticeData>("practice", { ...data, answers });
    /* Every checked problem is a scored event, so Today and Progress learn
       from Practice the way they learn from flashcards. A guess that landed
       counts for half: it is not nothing, and it is not knowing. */
    void learningEventsApi
      .record({
        source: "quick_check",
        topicKey: normaliseTopicKey(question.topic || session.objective),
        score: correct ? (confidence === "guess" ? 0.5 : 1) : 0,
        clientId: `practice:${session.id}:${index}`,
        payload: { mode: "practice", confidence },
      })
      .catch(() => {
        /* Best-effort, like every other evidence write. */
      });
    /* A lucky guess is not evidence of knowing — it is rescheduled, not
       credited. Wrong answers are evidence either way. */
    if (!(correct && confidence === "guess")) {
      record(
        candidatesFromQuizAnswers(
          [
            {
              topic: question.topic || session.objective,
              correct,
              question: question.question,
              chosen: question.choices[chosen],
            },
          ],
          { subject: session.subject, attemptId: session.id },
        ),
      );
    }
  };

  const askAbout = (q: string) => {
    if (!question) return;
    setAside({ q });
    task.run(
      () =>
        askInSession({
          question: `${q}\n(Give me a hint, not the answer.)`,
          history: [],
          context: buildSessionContext({
            objective: session.objective,
            step: question.question,
            mode: "practice",
          }),
          topic: [session.subject, session.objective].filter(Boolean).join(" "),
          settings,
        }),
      (a) => setAside({ q, a }),
    );
  };

  const next = () => {
    setAside(null);
    setChosen(null);
    setConfidence(null);
    if (data.questions && index + 1 >= data.questions.length) ctl.finish();
    else ctl.setStep(index + 1);
  };

  const strike = () => {
    if (!question) return;
    const already = data.struck[index] ?? [];
    const wrong = question.choices
      .map((_, i) => i)
      .filter((i) => i !== question.correctIndex && !already.includes(i) && i !== chosen);
    if (!wrong.length) return;
    ctl.setModeData<PracticeData>("practice", {
      ...data,
      struck: { ...data.struck, [index]: [...already, wrong[0]] },
    });
  };

  const right = Object.values(data.answers).filter((a) => a.correct).length;
  const guessed = Object.values(data.answers).filter(
    (a) => a.correct && a.confidence === "guess",
  ).length;

  return (
    <>
      <div className={styles.scroll}>
        <div className={styles.column}>
          {question && !done ? (
            <>
              <div className={styles.metaRow}>
                <span className={text.meta}>
                  Problem {index + 1} of {data.questions?.length}
                  {data.mixedWith.length ? ` · mixed with ${data.mixedWith.join(", ")}` : ""}
                </span>
                <span className={text.meta}>
                  {secondsLeft !== null
                    ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} left`
                    : "No timer"}
                </span>
              </div>
              <p className={styles.problem}>{question.question}</p>
              {question.attribution ? (
                <p className={styles.caption}>{question.attribution}</p>
              ) : null}
              <ul className={styles.options} aria-label="Choices">
                {question.choices.map((choice, i) => {
                  const struck = data.struck[index]?.includes(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className={styles.option}
                        aria-pressed={(answer?.chosen ?? chosen) === i}
                        data-result={
                          answer && i === question.correctIndex
                            ? "right"
                            : answer && answer.chosen === i
                              ? "wrong"
                              : undefined
                        }
                        disabled={Boolean(answer) || struck}
                        onClick={() => setChosen(i)}
                      >
                        <span className={styles.key} aria-hidden="true">
                          {KEYS[i]}
                        </span>
                        {struck ? <s>{choice}</s> : choice}
                        {struck ? <span className={styles.srOnly}> (ruled out by a hint)</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {answer ? (
                <>
                  <p className={styles.verdict} data-result={answer.correct ? "right" : "wrong"}>
                    {answer.correct
                      ? answer.confidence === "guess"
                        ? "✓ Right, but you guessed. It will come back sooner so it sticks. "
                        : "✓ Right. "
                      : "✕ Not this one. "}
                    {question.feedback ?? ""}
                  </p>
                  <div className={styles.actions}>
                    <Button variant="primary" onClick={next}>
                      {data.questions && index + 1 >= data.questions.length ? "Finish" : "Next problem"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <ConfidencePicker value={confidence} onChange={setConfidence} />
                  <div className={styles.actions}>
                    <Button variant="primary" onClick={check} disabled={chosen === null}>
                      Check my answer
                    </Button>
                    <Button variant="ghost" onClick={strike}>
                      Hint (costs nothing)
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : null}

          {done && data.questions ? (
            <div className={styles.check}>
              <p className={text.meta}>Practice done</p>
              <p className={styles.checkQuestion}>
                {right} of {data.questions.length} right
                {guessed ? `, ${guessed} of them guessed` : ""}.
              </p>
              <p className={styles.caption}>
                Wrong and guessed answers go back into your plan; Today will
                bring them round again.
              </p>
            </div>
          ) : null}

          {aside?.a ? (
            <TutorTurn meta="Hint">
              <p>{aside.a}</p>
            </TutorTurn>
          ) : null}

          <Pending
            pending={task.pending}
            error={task.error}
            stopped={task.stopped}
            caption={
              aside
                ? "Reading your question"
                : `Writing ${PRACTICE_PROBLEMS} problems on ${session.objective}`
            }
            onStop={task.stop}
            onRetry={data.questions ? task.again : generate}
            onFallback={() => onSwitchMode("recall")}
          />
        </div>
      </div>
      <SessionComposer
        placeholder="Stuck? Ask about this problem…"
        inputLabel="Ask about this problem"
        onSend={askAbout}
        busy={task.pending}
        disabled={!question || Boolean(done) || Boolean(answer)}
        actions={[
          { label: "Skip step", onClick: next, disabled: !question || Boolean(done) },
        ]}
        onFlag={question?.feedback ? () => onFlag(question.feedback ?? "") : undefined}
      />
    </>
  );
}
