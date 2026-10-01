import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { StudentTurn } from "../../../components/learning/StudentTurn";
import { TutorTurn } from "../../../components/learning/TutorTurn";
import {
  generateMicroRepair,
  type CognitiveStackTrace,
  type MicroRepairChallenge,
} from "../../../api/aiDebugger";
import { planExplanation } from "../../../api/aiExplain";
import { learningEventsApi } from "../../../api/learningEvents";
import { normaliseTopicKey } from "../../../lib/topicKey";
import type { MisconceptionCandidate } from "../../../lib/misconceptions";
import { askInSession, buildSessionContext, type SessionTurn } from "../../../api/aiSession";
import { useRecordMisconceptions } from "../../../hooks/useMisconceptions";
import { useSettings } from "../../../context/settings";
import { Pending } from "../Pending";
import { SessionComposer } from "../SessionComposer";
import { useAiTask } from "../useAiTask";
import type { ModeProps } from "../modeTypes";
import styles from "../session.module.css";

/** What Explain keeps between visits. */
export interface ExplainData {
  trace?: CognitiveStackTrace;
  repair?: MicroRepairChallenge;
  chosen?: number;
  /** How many check questions have been asked. A miss is followed by a new
   *  question, never the one whose answer was just shown. */
  checks?: number;
  /** Follow-up questions and answers, per step. */
  thread: Record<number, SessionTurn[]>;
}

const KEYS = ["A", "B", "C", "D", "E"];

/* Explain teaches a three-step plan from the foundation up (aiExplain.ts),
   then checks it with one question. Building the plan writes nothing to the
   misconception ledger — a student who names a topic has not made a mistake.
   A wrong check answer is the evidence: that, and only that, is recorded. A
   step is about three sentences, so the tutor never goes far without a
   check. */
export function ExplainMode({ session, ctl, onFlag, onSwitchMode }: ModeProps) {
  const { settings } = useSettings();
  const record = useRecordMisconceptions();
  const task = useAiTask();
  const data = useMemo<ExplainData>(
    () => ({ thread: {}, ...((session.data.explain as ExplainData | undefined) ?? {}) }),
    [session.data.explain],
  );
  const [asking, setAsking] = useState(false);

  const save = (patch: Partial<ExplainData>) =>
    ctl.setModeData<ExplainData>("explain", { ...data, ...patch });

  const layers = useMemo(
    () => [...(data.trace?.layers ?? [])].sort((a, b) => a.level - b.level),
    [data.trace],
  );

  const diagnose = () =>
    task.run(
      () =>
        planExplanation(
          session.subject || "General",
          session.objective,
          session.watchingFor?.text,
        ),
      (trace) => {
        if (trace.degraded) {
          throw new Error(trace.degraded.message);
        }
        const sorted = [...trace.layers].sort((a, b) => a.level - b.level);
        ctl.update((s) => ({
          ...s,
          plan: [
            ...sorted.map((l, i) => ({ id: `layer-${i}`, label: l.concept })),
            { id: "check", label: "Check it together" },
          ],
          currentStep: 0,
          data: { ...s.data, explain: { ...data, trace } },
        }));
      },
    );

  useEffect(() => {
    if (!data.trace) task.once("diagnose", diagnose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = session.currentStep;
  const onCheckStep = layers.length > 0 && step >= layers.length;
  const layer = layers[step];
  const thread = data.thread[step] ?? [];

  /* The check step's exercise, fetched once when the student reaches it. */
  useEffect(() => {
    if (!onCheckStep || data.repair || task.pending || task.error) return;
    const root = layers[0]?.concept ?? session.objective;
    task.once("repair", () =>
      task.run(
        () => generateMicroRepair(root),
        (result) => {
          if (!result.challenge) throw new Error(result.degraded.message);
          save({ repair: result.challenge });
        },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCheckStep, data.repair]);

  const ask = (question: string) => {
    const history = thread;
    const withQuestion = [...history, { role: "user" as const, content: question }];
    save({ thread: { ...data.thread, [step]: withQuestion } });
    setAsking(true);
    task.run(
      () =>
        askInSession({
          question,
          history,
          context: buildSessionContext({
            objective: session.objective,
            step: layer?.concept,
            mode: "explain",
            watchingFor: session.watchingFor?.text,
          }),
          settings,
        }),
      (answer) => {
        setAsking(false);
        ctl.setModeData<ExplainData>("explain", {
          ...data,
          thread: {
            ...data.thread,
            [step]: [...withQuestion, { role: "model", content: answer }],
          },
        });
      },
    );
  };

  /* A check answer is evidence only the first time a question is seen: it
     used to be possible to miss, see the answer marked, press "Try it
     again" on the same question and have the copied answer recorded as a
     perfect score. */
  const choose = (index: number) => {
    const repair = data.repair;
    if (!repair || data.chosen !== undefined) return;
    const right = index === repair.interactiveExercise.correctIndex;
    const checks = (data.checks ?? 0) + 1;
    save({ chosen: index, checks });
    const concept = repair.rootConcept || layers[0]?.concept || session.objective;
    void learningEventsApi
      .record({
        source: "quick_check",
        topicKey: normaliseTopicKey(session.objective),
        score: right ? 1 : 0,
        clientId: `explain:${session.id}:${repair.id}`,
        payload: { mode: "explain", concept },
      })
      .catch(() => {
        /* Best-effort, like every other evidence write. */
      });
    /* A miss is evidence of a gap. Getting a fresh question right after a
       miss is the correction that closes it; a right answer first time is
       just a pass and leaves the ledger alone. */
    if (!right || checks > 1) {
      const candidate: MisconceptionCandidate = {
        subject: session.subject || "General",
        concept,
        summary: repair.interactiveExercise.firstPrinciplesExplanation,
        severity: "moderate",
        tool: "debugger",
        sourceId: repair.id,
        kind: right ? "correction" : "evidence",
        detail: `Check question: ${repair.interactiveExercise.prompt}`,
      };
      record([candidate]);
    }
  };

  /* After a miss: a different question on the same idea. */
  const retryCheck = () => {
    const previous = data.repair;
    if (!previous) return;
    const root = layers[0]?.concept ?? session.objective;
    task.run(
      () => generateMicroRepair(root, { avoidPrompt: previous.interactiveExercise.prompt }),
      (result) => {
        if (!result.challenge) throw new Error(result.degraded.message);
        save({ repair: result.challenge, chosen: undefined });
      },
    );
  };

  /* "Say this step back": the student's own sentence, checked by the tutor. */
  const sayItBack = (attempt: string) =>
    ask(
      `Here is how I'd say this step in one sentence: "${attempt}". Is that right? If anything important is missing or wrong, tell me what in one or two sentences.`,
    );

  const lastTutorText =
    [...thread].reverse().find((t) => t.role === "model")?.content ??
    layer?.explanation ??
    "";

  return (
    <>
      <div className={styles.scroll}>
        <div className={styles.column}>
          {layer ? (
            <TutorTurn
              meta={`Step ${step + 1} · Explain`}
              claim={layer.concept}
              claimLevel={2}
              trap={
                step === 0
                  ? session.watchingFor?.text || data.trace?.rootCauseSummary || undefined
                  : undefined
              }
              deeper={layer.prerequisiteOf ? `This is what ${layer.prerequisiteOf} is built on.` : undefined}
              check={
                <div className={styles.check}>
                  <SayItBack onSubmit={sayItBack} disabled={task.pending} />
                  <div className={styles.actions}>
                    <Button variant="primary" onClick={() => ctl.setStep(step + 1)}>
                      I've got it, next step
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => ask("Not yet. Explain this step more simply.")}
                    >
                      Not yet
                    </Button>
                  </div>
                </div>
              }
            >
              <p>{layer.explanation}</p>
            </TutorTurn>
          ) : null}

          {onCheckStep ? (
            <TutorTurn
              meta={`Step ${step + 1} · Check`}
              claim="Put the steps together."
              claimLevel={2}
              structure={
                <div className={styles.stepsGrid}>
                  {layers.map((l, i) => (
                    <div key={l.concept}>
                      <span className={styles.caption}>{`${i + 1} · ${l.concept}`}</span>
                    </div>
                  ))}
                </div>
              }
              check={
                data.repair ? (
                  <RepairCheck
                    repair={data.repair}
                    chosen={data.chosen}
                    onChoose={choose}
                    onRetry={retryCheck}
                    onDone={ctl.finish}
                  />
                ) : undefined
              }
            >
              {data.repair ? <p>{data.repair.intuitionSummary}</p> : null}
            </TutorTurn>
          ) : null}

          {thread.map((turn, i) =>
            turn.role === "user" ? (
              <StudentTurn key={i}>{turn.content}</StudentTurn>
            ) : (
              <TutorTurn key={i}>
                <p>{turn.content}</p>
              </TutorTurn>
            ),
          )}

          <Pending
            pending={task.pending}
            error={task.error}
            stopped={task.stopped}
            caption={
              asking
                ? `Reading ${session.sourceRefs[0]?.title ?? "your step"}`
                : data.trace
                  ? "Writing a check for this idea"
                  : `Working out where ${session.objective} starts`
            }
            onStop={() => {
              setAsking(false);
              task.stop();
            }}
            onRetry={data.trace ? task.again : diagnose}
            onFallback={() => onSwitchMode("recall")}
          />
        </div>
      </div>
      <SessionComposer
        placeholder="Ask about this step…"
        inputLabel="Ask about this step"
        onSend={ask}
        busy={task.pending}
        disabled={!data.trace}
        actions={[
          { label: "Simpler", onClick: () => ask("Explain this step more simply.") },
          { label: "Example", onClick: () => ask("Give me one concrete example of this step.") },
          {
            label: "Skip step",
            onClick: () => ctl.setStep(step + 1),
            disabled: !layer,
          },
        ]}
        onFlag={lastTutorText ? () => onFlag(lastTutorText) : undefined}
      />
    </>
  );
}

function RepairCheck({
  repair,
  chosen,
  onChoose,
  onRetry,
  onDone,
}: {
  repair: MicroRepairChallenge;
  chosen?: number;
  onChoose: (i: number) => void;
  onRetry: () => void;
  onDone: () => void;
}) {
  const { prompt, options, correctIndex, firstPrinciplesExplanation } =
    repair.interactiveExercise;
  const answered = chosen !== undefined;
  const right = chosen === correctIndex;
  return (
    <div className={styles.check}>
      <p className={styles.checkQuestion}>{prompt}</p>
      <ul className={styles.options}>
        {options.map((option, i) => (
          <li key={i}>
            <button
              type="button"
              className={styles.option}
              aria-pressed={chosen === i}
              data-result={
                answered && i === correctIndex ? "right" : answered && chosen === i ? "wrong" : undefined
              }
              disabled={answered}
              onClick={() => onChoose(i)}
            >
              <span className={styles.key} aria-hidden="true">
                {KEYS[i]}
              </span>
              {option}
              {answered && i === correctIndex ? (
                <span className={styles.srOnly}> (correct answer)</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {answered ? (
        <>
          <p className={styles.verdict} data-result={right ? "right" : "wrong"}>
            {right ? "✓ Right. " : "✕ Not this time. "}
            {firstPrinciplesExplanation}
          </p>
          <div className={styles.actions}>
            {right ? (
              <Button variant="primary" onClick={onDone}>
                Finish session
              </Button>
            ) : (
              <Button variant="secondary" onClick={onRetry}>
                Try a different question
              </Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SayItBack({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className={styles.sayBack}
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (!text) return;
        onSubmit(text);
        setValue("");
      }}
    >
      <label className={styles.checkQuestion} htmlFor="say-it-back">
        Could you say this step back in one sentence?
      </label>
      <div className={styles.sayBackRow}>
        <input
          id="say-it-back"
          className={styles.answerBox}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="In your own words…"
          maxLength={400}
          disabled={disabled}
        />
        <Button type="submit" variant="secondary" disabled={disabled || !value.trim()}>
          Check mine
        </Button>
      </div>
    </form>
  );
}
