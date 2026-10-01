import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { StudentTurn } from "../../../components/learning/StudentTurn";
import { TutorTurn } from "../../../components/learning/TutorTurn";
import {
  diagnoseCognitiveGap,
  generateMicroRepair,
  recordRepairSuccess,
  type CognitiveStackTrace,
  type MicroRepairChallenge,
} from "../../../api/aiDebugger";
import { askInSession, buildSessionContext, type SessionTurn } from "../../../api/aiSession";
import { useRecordMisconceptions } from "../../../hooks/useMisconceptions";
import { useSettings } from "../../../context/settings";
import { candidatesFromStackTrace } from "../../../lib/misconceptions";
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
  /** Follow-up questions and answers, per step. */
  thread: Record<number, SessionTurn[]>;
}

const KEYS = ["A", "B", "C", "D", "E"];

/* Explain runs on the Debugger's diagnosis: its three layers become the plan,
   taught from the root idea up, and the last step is the Debugger's own
   micro-repair exercise as the check. A layer is about three sentences, so
   the tutor never goes far without a check. */
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
        diagnoseCognitiveGap(
          session.subject || "General",
          session.objective,
          session.watchingFor?.text,
        ),
      (trace) => {
        if (trace.degraded) {
          throw new Error(trace.degraded.message);
        }
        /* A stand-in trace returns no candidates; a real one feeds the
           ledger exactly as the Solver did. */
        record(candidatesFromStackTrace(trace));
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

  const choose = (index: number) => {
    if (!data.repair || data.chosen !== undefined) return;
    save({ chosen: index });
    if (index === data.repair.interactiveExercise.correctIndex && data.trace) {
      void recordRepairSuccess(data.trace.id, data.repair.id);
    }
  };

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
                  ? session.watchingFor?.text ?? data.trace?.rootCauseSummary
                  : undefined
              }
              deeper={layer.prerequisiteOf ? `This is what ${layer.prerequisiteOf} is built on.` : undefined}
              check={
                <div className={styles.check}>
                  <p className={styles.checkQuestion}>
                    Could you say this step back in one sentence?
                  </p>
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
                    onRetry={() => save({ chosen: undefined })}
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
                Try it again
              </Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
