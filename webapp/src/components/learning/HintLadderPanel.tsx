import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { getHintLadder } from "../../api/aiHints";
import { advanceRung, cachedLadder, getRung } from "../../lib/hintState";
import { questionKey } from "../../lib/questionKey";
import { studentLevel } from "../../lib/studentLevel";
import { renderMathText } from "../../lib/markdownToReact";
import {
  WORKED_RUNG,
  askForAnswerReply,
  nextRung,
  rungText,
  type HintLadder,
  type HintRung,
  type LadderQuestion,
} from "../../lib/tutorPolicy";
import styles from "./hintLadder.module.css";

/* "I'm stuck": the hint ladder for one question (lib/tutorPolicy.ts).
 *
 * Nudge, then a more specific step, then the worked solution — the first
 * time the answer is shown. Reaching the worked solution hands the question
 * to the parent (`onWorked`), which records it as wrong and sends it to the
 * mistake loop for a retest on a new question. "Just tell me" is never
 * refused: it says what's coming and shows the next rung.
 *
 * The rung is stored per attempt and question, so a refresh or a resumed
 * quiz picks up where the student was; the ladder text is cached, so it
 * still works offline once fetched. */

const RUNG_LABEL: Record<HintRung, string> = { 0: "", 1: "Hint", 2: "Next step", 3: "Worked solution" };

export function HintLadderPanel({
  question,
  attemptKey,
  answered,
  onClimb,
  onWorked,
}: {
  question: LadderQuestion;
  attemptKey: string;
  /** Once the question is answered the ladder is read-only. */
  answered: boolean;
  /** Called whenever a rung is reached, so the parent can keep the attempt. */
  onClimb?: () => void;
  onWorked: () => void;
}) {
  const qKey = questionKey(question.question);
  const [rung, setRung] = useState<HintRung>(() => getRung(attemptKey, qKey));
  const [ladder, setLadder] = useState<HintLadder | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const workedSent = useRef(false);

  /* A new question, or a resumed one: pick up its stored rung and ladder. */
  useEffect(() => {
    const stored = getRung(attemptKey, qKey);
    setRung(stored);
    setReply(null);
    setProblem(null);
    workedSent.current = stored >= WORKED_RUNG;
    let live = true;
    void studentLevel()
      .catch(() => null)
      .then(async (level) => {
        const cached = cachedLadder(qKey, level);
        if (cached || stored === 0) {
          if (live) setLadder(cached);
          return;
        }
        /* Mid-ladder but the text is gone (cleared storage, another device):
           fetch it again so the student sees the hints they already had. */
        const result = await getHintLadder(question, level);
        if (live) setLadder(result.ladder ?? null);
      });
    return () => {
      live = false;
    };
    // The question object is only read when re-fetching for this key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptKey, qKey]);

  const climb = async (askedForAnswer: boolean) => {
    if (loading || answered) return;
    let current = ladder;
    if (!current) {
      setLoading(true);
      setProblem(null);
      const level = await studentLevel().catch(() => null);
      const result = await getHintLadder(question, level);
      setLoading(false);
      if (!result.ladder) {
        setProblem(result.degraded.message);
        return;
      }
      current = result.ladder;
      setLadder(current);
    }
    const target = nextRung(current, rung);
    setReply(askedForAnswer ? askForAnswerReply(target) : null);
    const held = advanceRung(attemptKey, qKey, target);
    setRung(held);
    onClimb?.();
    if (held >= WORKED_RUNG && !workedSent.current) {
      workedSent.current = true;
      onWorked();
    }
  };

  const shown = ladder
    ? ([1, 2, 3] as const).filter((r) => r <= rung && rungText(ladder, r))
    : [];

  if (answered && rung === 0) return null;

  return (
    <section className={styles.ladder} aria-label="Help with this question">
      {shown.map((r) => (
        <div key={r} className={styles.rung} data-rung={r}>
          <p className={styles.rungLabel}>{RUNG_LABEL[r]}</p>
          <p>{renderMathText(rungText(ladder!, r))}</p>
        </div>
      ))}
      {rung >= WORKED_RUNG ? (
        <p className={styles.note} role="status">
          This one counts as a miss for now. It comes back as a fresh question in a couple of days.
        </p>
      ) : null}
      {reply ? <p className={styles.note}>{reply}</p> : null}
      {problem ? (
        <p className={styles.note} role="status">
          {problem}
        </p>
      ) : null}
      {!answered && rung < WORKED_RUNG ? (
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => void climb(false)}>
            <Icon name="sparkles" size={14} />{" "}
            {loading
              ? "Thinking…"
              : problem
                ? "Try again"
                : rung === 0
                  ? "I'm stuck — give me a hint"
                  : ladder && nextRung(ladder, rung) === WORKED_RUNG
                    ? "Show the worked solution"
                    : "Another hint"}
          </Button>
          {rung > 0 ? (
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void climb(true)}>
              Just tell me the answer
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
