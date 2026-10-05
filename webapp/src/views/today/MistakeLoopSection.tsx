import { useState } from "react";
import { Button } from "../../components/Button";
import { MisconceptionRepair } from "../../components/learning/MisconceptionRepair";
import repairStyles from "../../components/learning/repair.module.css";
import { useExams } from "../../hooks/useExams";
import { useRecordRepair, useRecordRetest } from "../../hooks/useMistakeLoop";
import { useSettings } from "../../context/settings";
import { isLoopSupported } from "../../api/misconceptions";
import { aiRetestQuestion, bankRetestQuestion, type RetestQuestion } from "../../api/retestQuestion";
import { getKnownMisconception } from "../../lib/misconceptionCatalogue";
import { isNamedPattern, needsRepair, retestsDue } from "../../lib/mistakeLoop";
import type { Misconception } from "../../lib/misconceptions";
import { localDateStr } from "../../lib/date";
import styles from "./today.module.css";

/* Today's half of the mistake loop: what needs a repair, and which repaired
 * mistakes are due their retest. Nothing here decides status: the repair and
 * the retest answer are written to the ledger, and the database rule
 * (lib/mistakeLoop.ts) says whether that fixed it. */

const MAX_ROWS = 3;

const ERROR_TYPE_LABEL: Record<string, string> = {
  concept: "Gap in the idea",
  misread: "Misread question",
  calculation: "Calculation slip",
  time: "Ran out of time",
};

/** What a row is called. A provisional AI label seen once is a guess, so it
 *  isn't presented as a named pattern until it has been seen twice. */
export function mistakeTitle(m: Misconception): string {
  if (!isNamedPattern(m)) return m.subject ? `A ${m.subject} question you missed` : "A question you missed";
  if (m.errorType) return `${ERROR_TYPE_LABEL[m.errorType] ?? "Mistake"}: ${m.concept}`;
  return m.concept;
}

function RepairRow({ m }: { m: Misconception }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const recordRepair = useRecordRepair();
  const entry = m.catalogueId ? getKnownMisconception(m.catalogueId) : null;

  return (
    <li className={styles.row}>
      <span className={styles.dot} data-kind="repair" aria-hidden="true" />
      <span className={styles.rowLabel}>{mistakeTitle(m)}</span>
      <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Fix it"}
      </Button>
      {open ? (
        <div className={styles.rowDetail}>
          {entry ? (
            <MisconceptionRepair
              entry={entry}
              sourceId={`today:${m.id}`}
              tool={m.originTool}
              detail="Opened from Today"
              recordEvidence={false}
              ledgerRow={m}
            />
          ) : m.repairText ? (
            <section className={repairStyles.repair} aria-label="Repair">
              <p className={repairStyles.label}>
                {m.provisional ? "Suggested by AI, not yet verified" : "General advice for this kind of slip"}
              </p>
              {isNamedPattern(m) && m.summary && !m.errorType ? (
                <p className={repairStyles.belief}>
                  It looks like you might think: <strong>{m.summary}</strong>
                </p>
              ) : null}
              <p>
                <span className={repairStyles.sub}>Try it this way. </span>
                {m.repairText}
              </p>
              {m.contrastText ? (
                <p>
                  <span className={repairStyles.sub}>Side by side. </span>
                  {m.contrastText}
                </p>
              ) : null}
              {done ? (
                <p className={repairStyles.outcome} role="status">
                  We'll check this with a different question in a couple of days.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    recordRepair(m, { sourceId: `today:${m.id}` });
                    setDone(true);
                  }}
                >
                  Got it
                </Button>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type Load = { state: "idle" | "loading" | "none" | "error" } | { state: "ready"; q: RetestQuestion };

function RetestRow({ m }: { m: Misconception }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [picked, setPicked] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const exams = useExams();
  const { settings } = useSettings();
  const recordRetest = useRecordRetest();

  async function getQuestion(useAi: boolean) {
    setLoad({ state: "loading" });
    try {
      const q = useAi
        ? await aiRetestQuestion(m, settings)
        : await bankRetestQuestion(m, exams.data ?? [], localDateStr(new Date()));
      setLoad(q ? { state: "ready", q } : { state: "none" });
    } catch {
      setLoad({ state: "error" });
    }
  }

  function toggle() {
    setOpen((v) => !v);
    if (load.state === "idle") void getQuestion(false);
  }

  function answer(i: number, q: RetestQuestion) {
    if (picked !== null) return;
    setPicked(i);
    void recordRetest(m, q.question, i === q.correctIndex).then((r) => setQueued(r.queued));
  }

  return (
    <li className={styles.row}>
      <span className={styles.dot} data-kind="retest" aria-hidden="true" />
      <span className={styles.rowLabel}>Check: {mistakeTitle(m)}</span>
      <Button size="sm" variant="secondary" onClick={toggle} aria-expanded={open}>
        {open ? "Hide" : "Retest"}
      </Button>
      {open ? (
        <div className={styles.rowDetail}>
          {load.state === "loading" ? <p className={repairStyles.outcome}>Finding a new question…</p> : null}
          {load.state === "none" || load.state === "error" ? (
            <p className={repairStyles.outcome}>
              {load.state === "error"
                ? "Couldn't get a question just now."
                : "No fresh question in the practice bank for this one."}{" "}
              <Button size="sm" variant="secondary" onClick={() => void getQuestion(true)}>
                Write one with AI
              </Button>
            </p>
          ) : null}
          {load.state === "ready" ? (
            <div className={repairStyles.check} role="group" aria-label="Retest question">
              <p className={repairStyles.checkQuestion}>{load.q.question}</p>
              <div className={repairStyles.choices}>
                {load.q.choices.map((choice, i) => (
                  <button
                    key={choice}
                    type="button"
                    className={`${repairStyles.choice} ${
                      picked === null
                        ? ""
                        : i === load.q.correctIndex
                          ? repairStyles.right
                          : i === picked
                            ? repairStyles.wrong
                            : ""
                    }`}
                    disabled={picked !== null}
                    onClick={() => answer(i, load.q)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              {picked !== null ? (
                <p className={repairStyles.outcome} role="status">
                  {picked === load.q.correctIndex
                    ? "Right, on a question you hadn't seen for this. That's the check it needed."
                    : "Not this time. It's back on your list, with a fresh repair."}
                  {queued ? " Saved on this device; it will sync when you're back online." : ""}
                </p>
              ) : null}
              {load.q.attribution ? <p className={repairStyles.sources}>{load.q.attribution}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function MistakeLoopSection({
  misconceptions,
  now,
}: {
  misconceptions: Misconception[];
  now: Date;
}) {
  /* Until the loop migration is applied nothing can be repaired or
     retested, so the section stays away rather than offering buttons that
     write nothing. Rows from before the loop have no repair to show; they
     stay on the dashboard ledger card. */
  if (!isLoopSupported()) return null;
  const due = retestsDue(misconceptions, now).slice(0, MAX_ROWS);
  const toRepair = misconceptions
    .filter((m) => needsRepair(m) && (m.repairText || m.catalogueId))
    .slice(0, MAX_ROWS);
  if (due.length === 0 && toRepair.length === 0) return null;

  return (
    <section aria-labelledby="today-mistakes">
      <h2 id="today-mistakes" className={styles.sectionTitle}>
        Mistakes to fix
      </h2>
      <ul className={styles.rows}>
        {due.map((m) => (
          <RetestRow key={`r:${m.id}`} m={m} />
        ))}
        {toRepair.map((m) => (
          <RepairRow key={`f:${m.id}`} m={m} />
        ))}
      </ul>
    </section>
  );
}
