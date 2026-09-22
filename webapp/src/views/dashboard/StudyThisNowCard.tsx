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

  /* Said plainly, and only about what the ledger actually knows: how many
     times this has come back, and how much else is still open on the paper.
     There is no prerequisite graph in this app, so nothing here claims that
     other topics depend on this one. */
  const evidencePhrase =
    pick.timesObserved > 1
      ? `This has tripped you up ${pick.timesObserved} times`
      : "This came up in your work";

  const restPhrase =
    pick.otherOpenOnPaper === 0
      ? "and it is the only thing still open on that paper."
      : pick.otherOpenOnPaper === 1
        ? "and there is one other topic still open on that paper."
        : `and there are ${pick.otherOpenOnPaper} other topics still open on that paper.`;

  return (
    <Card className={styles.card} data-testid="study-this-now">
      <span className={styles.eyebrow}>Study this now</span>
      <h2 className={styles.concept}>{pick.concept}</h2>
      <p className={styles.reason}>
        {whenPhrase}. {evidencePhrase} {restPhrase} Fixing this one moves the
        most marks.
      </p>

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
