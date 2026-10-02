import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HintLadder } from "../../../components/learning/HintLadder";
import type { HintLevel } from "../../../components/learning/options";
import { StudentTurn } from "../../../components/learning/StudentTurn";
import { TutorTurn } from "../../../components/learning/TutorTurn";
import {
  startSparringSession,
  submitStudentAnswer,
  type SparringSession,
} from "../../../api/aiSparring";
import { askInSession, buildSessionContext } from "../../../api/aiSession";
import { useRecordMisconceptions } from "../../../hooks/useMisconceptions";
import { useSettings } from "../../../context/settings";
import { candidatesFromSparring } from "../../../lib/misconceptions";
import { Pending } from "../Pending";
import { SessionComposer } from "../SessionComposer";
import { useAiTask } from "../useAiTask";
import type { ModeProps } from "../modeTypes";
import text from "../../../styles/text.module.css";
import styles from "../session.module.css";

/** Questions a Socratic session asks before it wraps up. */
export const SOCRATIC_ROUNDS = 4;

const TUTOR_UNREACHED =
  "I couldn't reach the tutor just now. Your session is saved — try again in a moment.";

export interface SocraticData {
  sparring?: SparringSession;
  /** Hints taken on the current question. */
  hints: HintLevel[];
  /** A hint's text, shown under the question. */
  hintText?: string;
}

/* Socratic runs on the Viva's sparring engine: one question at a time, the
   student answers, the tutor reacts and asks the next. The hint ladder is
   always on screen — asking costs nothing. Viva is this mode with the mic
   on by default. */
export function SocraticMode({ session, ctl, onFlag, onSwitchMode }: ModeProps) {
  const { settings } = useSettings();
  const record = useRecordMisconceptions();
  const task = useAiTask();
  const [answering, setAnswering] = useState(false);
  const data = useMemo<SocraticData>(
    () => ({ hints: [], ...((session.data.socratic as SocraticData | undefined) ?? {}) }),
    [session.data.socratic],
  );
  const save = (patch: Partial<SocraticData>) =>
    ctl.setModeData<SocraticData>("socratic", { ...data, ...patch });

  const start = () =>
    task.run(
      () =>
        startSparringSession(
          session.objective,
          undefined,
          undefined,
          undefined,
          session.watchingFor?.text,
        ),
      (sparring) => {
        /* The built-in question bank is topic-agnostic ("what happens if the
           external boundary changes?" for enzymes). Inside a session it is
           an error with a retry, not tutoring. Declined consent keeps it,
           labelled, because the student chose that. */
        if (sparring.offline === "unavailable") throw new Error(TUTOR_UNREACHED);
        ctl.update((s) => ({
          ...s,
          plan: Array.from({ length: SOCRATIC_ROUNDS }, (_, i) => ({
            id: `q${i + 1}`,
            label: `Question ${i + 1}`,
          })),
          currentStep: 0,
          data: { ...s.data, socratic: { hints: [], sparring } },
        }));
      },
    );

  useEffect(() => {
    if (!data.sparring) task.once("start", start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sparring = data.sparring;
  const round = Math.min(session.currentStep + 1, SOCRATIC_ROUNDS);
  const done = session.status === "done";

  const answer = (reply: string) => {
    if (!sparring) return;
    setAnswering(true);
    task.run(
      () => submitStudentAnswer(sparring, reply),
      ({ session: next, feedback }) => {
        setAnswering(false);
        if (next.offline === "unavailable" && !sparring.offline) {
          throw new Error(TUTOR_UNREACHED);
        }
        if (!next.offline) {
          record(
            candidatesFromSparring(feedback, {
              subject: session.subject,
              topic: session.objective,
              sessionId: session.id,
            }),
          );
        }
        const answered = session.currentStep + 1;
        ctl.update((s) => ({
          ...s,
          currentStep: Math.min(answered, SOCRATIC_ROUNDS),
          status: answered >= SOCRATIC_ROUNDS ? "done" : s.status,
          data: { ...s.data, socratic: { hints: [], sparring: next } },
        }));
      },
    );
  };

  const hint = (level: HintLevel) => {
    if (!sparring) return;
    const hints = sparring.currentChallenge.suggestedHints ?? [];
    const anchor = sparring.currentChallenge.conceptAnchor;
    if (level === "nudge") {
      save({
        hints: [...data.hints, level],
        hintText: hints[0] ?? `Start from what the question is really about: ${anchor}.`,
      });
      return;
    }
    if (level === "bigger") {
      save({
        hints: [...data.hints, level],
        hintText: hints[1] ?? hints[0] ?? `The idea you need is ${anchor}. How does it apply here?`,
      });
      return;
    }
    task.run(
      () =>
        askInSession({
          question: `Show me a model answer to "${sparring.currentChallenge.speechText}", then ask me one short question to check I understood it.`,
          history: [],
          context: buildSessionContext({
            objective: session.objective,
            step: anchor,
            mode: "socratic",
          }),
          topic: [session.subject, session.objective].filter(Boolean).join(" "),
          settings,
        }),
      (shown) => save({ hints: [...data.hints, level], hintText: shown }),
    );
  };

  /* The dialogue minus the question currently on screen, which is the
     heading rather than a turn. */
  const turns = sparring
    ? sparring.dialogue.filter(
        (d) => d.content !== sparring.currentChallenge.speechText,
      )
    : [];
  const lastTutor = [...turns].reverse().find((d) => d.speaker !== "student");

  return (
    <>
      <div className={styles.scroll}>
        <div className={styles.column}>
          {sparring && !done ? (
            <>
              <div className={styles.metaRow}>
                <span className={text.meta}>
                  Question {round} of ~{SOCRATIC_ROUNDS}
                </span>
              </div>
              {sparring.offline ? (
                /* A stand-in must never pass for the AI, and its keyword
                   checker's marks never reach the ledger (see answer()). */
                <p className={styles.caption} role="status">
                  {sparring.offline === "consent"
                    ? "You haven't allowed Learnora's AI to use your study data, so these are built-in practice questions."
                    : "Learnora's AI isn't available right now, so these are built-in practice questions."}{" "}
                  Your answers are checked by a simple keyword match and aren't
                  saved to your progress.
                  {sparring.offline === "consent" ? (
                    <>
                      {" "}
                      <Link to="/settings?tab=privacy">Turn on AI in Settings</Link>
                    </>
                  ) : null}
                </p>
              ) : null}
              <h2 className={styles.question}>
                {sparring.currentChallenge.speechText}
              </h2>
            </>
          ) : null}

          {done ? (
            <TutorTurn meta="Done" claim="That's the four questions." claimLevel={2}>
              <p>
                Everything you answered is saved. What you missed goes on your
                misconception ledger in Progress, and Today will bring it back.
              </p>
            </TutorTurn>
          ) : null}

          <div className={styles.thread}>
            {turns.map((d) =>
              d.speaker === "student" ? (
                <StudentTurn key={d.id}>{d.content}</StudentTurn>
              ) : (
                <TutorTurn key={d.id}>
                  <p>{d.content}</p>
                  {d.feedback?.missingPoints?.length ? (
                    <p>Still missing: {d.feedback.missingPoints.join("; ")}.</p>
                  ) : null}
                </TutorTurn>
              ),
            )}
          </div>

          {data.hintText ? (
            <TutorTurn meta="Hint">
              <p>{data.hintText}</p>
            </TutorTurn>
          ) : null}

          {sparring && !done ? (
            <HintLadder onHint={hint} used={data.hints} disabled={task.pending} />
          ) : null}

          <Pending
            pending={task.pending}
            error={task.error}
            stopped={task.stopped}
            caption={
              answering
                ? "Reading your answer"
                : sparring
                  ? "Writing a worked answer"
                  : `Writing the first question on ${session.objective}`
            }
            onStop={() => {
              setAnswering(false);
              task.stop();
            }}
            onRetry={sparring ? task.again : start}
            onFallback={() => onSwitchMode("recall")}
          />
        </div>
      </div>
      <SessionComposer
        placeholder={session.voice ? "Say your answer, or type it…" : "Type your answer…"}
        onSend={answer}
        busy={task.pending}
        disabled={!sparring || done}
        voiceDefault={session.voice}
        actions={[
          {
            label: "Simpler",
            onClick: () => hint("nudge"),
            disabled: !sparring || done,
          },
          {
            label: "Example",
            onClick: () => hint("show"),
            disabled: !sparring || done,
          },
          {
            label: "Skip step",
            onClick: () => answer("I don't know. Please move on to the next question."),
            disabled: !sparring || done,
          },
        ]}
        onFlag={lastTutor ? () => onFlag(lastTutor.content) : undefined}
      />
    </>
  );
}
