import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useExams } from "../../hooks/useExams";
import { useFolders } from "../../hooks/useFolders";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useTimer } from "../../context/timer";
import { pickStudyNow } from "../../lib/studyNow";
import { getSavedTraces } from "../../api/aiDebugger";
import styles from "./StudyThisNowCard.module.css";

/**
 * The answer to "what should I do right now".
 *
 * Every other card on this dashboard reports a state and leaves the student
 * to work out what it implies. This one reads the same data — the nearest
 * exam, and the misconception ledger for that exam's subject — and names one
 * thing to do about it.
 *
 * It renders nothing at all when there is no upcoming exam or nothing open
 * for its subject. The selection rule lives in `lib/studyNow.ts` and refuses
 * to invent a recommendation; an empty version of this card would teach the
 * student to stop reading it.
 */
export function StudyThisNowCard() {
  const navigate = useNavigate();
  const { prepareFocus } = useTimer();
  const exams = useExams();
  const folders = useFolders();
  const { all, isPending } = useMisconceptions();

  const pick = useMemo(
    () =>
      pickStudyNow({
        exams: exams.data,
        folders: folders.data,
        misconceptions: all,
        traces: getSavedTraces(),
      }),
    [exams.data, folders.data, all],
  );

  /* No skeleton: this block is allowed to be absent, so a placeholder would
     promise a recommendation that may never arrive. */
  if (isPending || exams.isPending || !pick) return null;

  const days = pick.daysUntilExam;
  const whenPhrase =
    days === 0
      ? `Your ${pick.subject} exam is today`
      : days === 1
        ? `Your ${pick.subject} exam is tomorrow`
        : `Your ${pick.subject} exam is in ${days} days`;

  /* Said plainly, and only about what the app actually knows. The dependents
     count comes from the student's own Debugger traces; when none link this
     concept to anything, the sentence falls back to the ledger's evidence
     rather than claiming a structure it has not seen. No mastery percentage:
     nothing in the app measures mastery per concept, and a made-up one would
     be the most persuasive number on the card. */
  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  let reason: string;
  if (pick.dependents > 0) {
    const repeat =
      pick.timesObserved > 1
        ? `, and it has tripped you up ${pick.timesObserved} times`
        : "";
    reason = `${whenPhrase}. This is the weakest thing it depends on — ${pick.dependents} other ${plural(pick.dependents, "topic", "topics")} on the paper ${plural(pick.dependents, "sits", "sit")} on top of it${repeat}. Fixing this one moves the most marks.`;
  } else {
    const evidence =
      pick.timesObserved > 1
        ? `This has tripped you up ${pick.timesObserved} times`
        : "This came up in your work";
    const rest =
      pick.otherOpenOnPaper === 0
        ? "and it is the only thing still open on that paper."
        : `and there ${plural(pick.otherOpenOnPaper, "is one other topic", `are ${pick.otherOpenOnPaper} other topics`)} still open on that paper.`;
    reason = `${whenPhrase}. ${evidence} ${rest} Fixing this one moves the most marks.`;
  }

  return (
    <Card className={styles.card} data-testid="study-this-now">
      <span className={styles.eyebrow}>Study this now</span>
      <h2 className={styles.concept}>{pick.concept}</h2>
      <p className={styles.reason}>{reason}</p>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            prepareFocus(pick.estimatedMinutes, pick.concept);
            void navigate("/timer");
          }}
          data-testid="study-this-now-start"
        >
          <Icon name="play" size={16} />
          <span>Start revising — {pick.estimatedMinutes} min</span>
        </Button>

        <Button
          variant="secondary"
          onClick={() =>
            void navigate(`/solver?topic=${encodeURIComponent(pick.concept)}`)
          }
        >
          See why it matters
        </Button>

        <Button variant="ghost" onClick={() => void navigate("/study")}>
          Something else
        </Button>
      </div>
    </Card>
  );
}
