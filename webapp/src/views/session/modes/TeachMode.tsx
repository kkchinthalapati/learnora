import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MasteryLadder } from "../../../components/learning/MasteryLadder";
import { StudentTurn } from "../../../components/learning/StudentTurn";
import { TutorTurn } from "../../../components/learning/TutorTurn";
import {
  evaluateTeachingExplanation,
  generateApprenticeDraft,
  getPersonaProfile,
  saveFeynmanSession,
  type ApprenticeDraft,
  type TeachingTurn,
} from "../../../api/aiFeynman";
import { useMisconceptions, useRecordMisconceptions } from "../../../hooks/useMisconceptions";
import { candidatesFromTeachingTurn } from "../../../lib/misconceptions";
import { isFlagOn } from "../../../lib/flags";
import { Pending } from "../Pending";
import { SessionComposer } from "../SessionComposer";
import { useAiTask } from "../useAiTask";
import type { ModeProps } from "../modeTypes";
import text from "../../../styles/text.module.css";
import styles from "../session.module.css";

/** Understanding (0–100) at which the apprentice has it. */
export const TEACH_DONE_SCORE = 85;

export interface TeachData {
  draft?: ApprenticeDraft;
  turns: TeachingTurn[];
}

/* Teach (Feynman): the student explains, a persona asks the questions a
   confused learner would. The persona is shown by initial, not emoji. The
   engine is the Feynman studio's; its session is mirrored so the existing
   debrief screen still works. */
export function TeachMode({ session, ctl, onFlag, onSwitchMode }: ModeProps) {
  const { forSubject } = useMisconceptions();
  const record = useRecordMisconceptions();
  const task = useAiTask();
  const [explaining, setExplaining] = useState(false);
  const data = useMemo<TeachData>(
    () => ({ turns: [], ...((session.data.teach as TeachData | undefined) ?? {}) }),
    [session.data.teach],
  );
  const showGaps = isFlagOn("teachGapChips");

  const start = () =>
    task.run(
      () =>
        generateApprenticeDraft(
          session.subject || "General",
          session.objective,
          "eli10",
          "intermediate",
          session.subject ? forSubject(session.subject) : [],
        ),
      (draft) => {
        if (draft.fromTemplate) {
          throw new Error(
            "I couldn't get your student ready just now. Nothing is lost — try again in a moment.",
          );
        }
        ctl.update((s) => ({
          ...s,
          plan: (draft.learningObjectives.length
            ? draft.learningObjectives
            : [`Explain ${s.objective}`]
          ).map((label, i) => ({ id: `o${i + 1}`, label })),
          currentStep: 0,
          data: { ...s.data, teach: { draft, turns: [] } },
        }));
      },
    );

  useEffect(() => {
    if (!data.draft) task.once("start", start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = data.draft;
  const persona = draft ? getPersonaProfile(draft.persona) : null;
  const personaName = persona?.shortName.split(" ")[0] ?? "Your student";
  const last = data.turns[data.turns.length - 1];
  const score = last?.understandingScore ?? 0;
  const done = session.status === "done";

  const explain = (explanation: string) => {
    if (!draft) return;
    setExplaining(true);
    task.run(
      () => evaluateTeachingExplanation(draft, data.turns, explanation),
      (turn) => {
        setExplaining(false);
        if (turn.scoredBy !== "local") {
          record(candidatesFromTeachingTurn(turn, draft));
        }
        const turns = [...data.turns, turn];
        const steps = Math.max(session.plan.length, 1);
        const reached = Math.min(
          steps,
          Math.floor((turn.understandingScore / 100) * steps),
        );
        const finished = turn.understandingScore >= TEACH_DONE_SCORE;
        const now = new Date().toISOString();
        saveFeynmanSession({
          id: session.id,
          subject: draft.subject,
          topic: draft.topic,
          persona: draft.persona,
          difficulty: draft.difficulty,
          draft,
          turns,
          currentScore: turn.understandingScore,
          status: finished ? "completed" : "active",
          createdAt: session.createdAt,
          updatedAt: now,
        });
        ctl.update((s) => ({
          ...s,
          currentStep: finished ? s.plan.length : reached,
          status: finished ? "done" : s.status,
          data: { ...s.data, teach: { draft, turns } },
        }));
      },
    );
  };

  const gaps = last ? [...(last.remainingGaps ?? []), ...last.confusionPoints] : [];
  const covered = last?.solvedPoints ?? [];

  return (
    <>
      <div className={styles.scroll}>
        <div className={styles.column}>
          {draft && persona ? (
            <div className={styles.persona}>
              <span className={styles.personaInitial} aria-hidden="true">
                {personaName.charAt(0)}
              </span>
              <div>
                <div className={styles.personaName}>{persona.shortName}</div>
                <p className={styles.personaText}>{persona.description}</p>
              </div>
            </div>
          ) : null}

          {draft ? (
            <div className={styles.thread}>
              <div className={styles.personaTurn}>
                <span className={styles.personaTurnName}>{personaName}</span>
                <p>{draft.challengeQuestion || `Can you explain ${session.objective} to me?`}</p>
              </div>
              {data.turns.map((turn) => (
                <div key={turn.id} className={styles.thread}>
                  <StudentTurn>{turn.userExplanation}</StudentTurn>
                  <div className={styles.personaTurn}>
                    <span className={styles.personaTurnName}>{personaName}</span>
                    <p>{turn.apprenticeReaction}</p>
                    {turn.feedback?.followUpQuestion ? (
                      <p>{turn.feedback.followUpQuestion}</p>
                    ) : null}
                    {turn.scoredBy === "local" ? (
                      <span className={styles.caption}>
                        Marked by the built-in checker: the AI wasn't available.
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {showGaps && last && (gaps.length || covered.length) ? (
            <div className={styles.gapChips} aria-label="What your explanation covered">
              {gaps.slice(0, 3).map((g) => (
                <span key={`s-${g}`} className={styles.gapChip} data-kind="skipped">
                  Skipped: {g}
                </span>
              ))}
              {covered.slice(0, 3).map((c) => (
                <span key={`c-${c}`} className={styles.gapChip} data-kind="covered">
                  Covered: {c}
                </span>
              ))}
            </div>
          ) : null}

          {done ? (
            <TutorTurn meta="Done" claim={`${personaName} has it.`} claimLevel={2}>
              <p>
                You explained it well enough for someone new to follow.{" "}
                <Link to={`/feynman/debrief/${encodeURIComponent(session.id)}`}>
                  See what you covered
                </Link>
                .
              </p>
              {/* Passing a teach-back is the Explained rung, so it fills here. */}
              <MasteryLadder topic={draft?.topic ?? session.objective} rung={4} gainedFrom={3} showRungLabels />
            </TutorTurn>
          ) : last ? (
            <p className={text.caption}>
              {personaName} understands about {score}% so far.
            </p>
          ) : null}

          <Pending
            pending={task.pending}
            error={task.error}
            stopped={task.stopped}
            caption={explaining ? `${personaName} is reading your explanation` : "Finding someone to teach"}
            onStop={() => {
              setExplaining(false);
              task.stop();
            }}
            onRetry={draft ? task.again : start}
            onFallback={() => onSwitchMode("recall")}
          />
        </div>
      </div>
      <SessionComposer
        placeholder={`Explain it to ${personaName}…`}
        inputLabel={`Your explanation for ${personaName}`}
        onSend={explain}
        busy={task.pending}
        disabled={!draft || done}
        onFlag={last ? () => onFlag(last.apprenticeReaction) : undefined}
      />
    </>
  );
}
