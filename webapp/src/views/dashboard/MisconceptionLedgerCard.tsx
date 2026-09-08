import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import {
  useDismissMisconception,
  useMisconceptions,
} from "../../hooks/useMisconceptions";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { Misconception } from "../../lib/misconceptions";
import styles from "./MisconceptionLedgerCard.module.css";

/* The ledger, made visible.
 *
 * Every other dashboard card reports activity — cards reviewed, streak held,
 * retention percentage. This one reports understanding, which is the thing a
 * student actually came here to change, and it is the only place in the app
 * where the diagnoses made by the Debugger, Feynman, the Pre-Mortem radar and
 * Sparring are gathered in one list instead of dying inside their own tool.
 *
 * The recurrence count is the point. "Seen 3 times, across the debugger and
 * your quizzes" is a claim nothing else in this app can make, and it is what
 * turns a pile of one-shot AI toys into a study partner with a memory — so it
 * is stated on the row rather than hidden behind a detail view.
 */

const SEVERITY_LABEL: Record<Misconception["severity"], string> = {
  critical: "Blocking",
  moderate: "Shaky",
  minor: "Worth a look",
};

const TOOL_LABEL: Record<Misconception["originTool"], string> = {
  debugger: "the Step-by-Step Solver",
  feynman: "Feynman",
  premortem: "Common Exam Traps",
  sparring: "Viva / Test Practice",
  quiz: "your quizzes",
  notes: "your notes",
  review: "review",
  "exam-detective": "the Exam Detective",
};

/** How many rows the card shows before deferring to the full list. Enough to
 *  be useful at a glance, few enough that the card does not become a wall of
 *  everything the student has ever got wrong — which would read as a telling-off
 *  rather than a next step. */
const VISIBLE_ROWS = 4;

export function MisconceptionLedgerCard() {
  const navigate = useNavigate();
  const { ranked, isPending, isError } = useMisconceptions();
  const dismiss = useDismissMisconception();
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? ranked : ranked.slice(0, VISIBLE_ROWS);

  /* Hands the concept to whichever tool the student picks next, using the
     bridge that already exists for tool-to-tool handoff — so "work on this"
     lands in the Debugger with the concept filled in rather than dumping them
     on an empty form. */
  const handleWorkOnIt = (m: Misconception) => {
    CognitiveBridge.setPayload({
      subject: m.subject,
      topic: m.concept,
      concept: m.concept,
      sourceTool: "notes",
      evidencePrompt: m.summary,
      misconceptions: [m.summary].filter(Boolean),
      severity: m.severity,
      suggestedAction: "debug_stack",
    });
    navigate("/solver");
  };

  return (
    <Card
      as="section"
      aria-label="Mistakes to Review"
      variant="elevated"
      className={styles.widget}
      aria-busy={isPending || undefined}
    >
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerIcon} aria-hidden="true">
            <Icon name="alert-triangle" size={20} />
          </div>
          <div>
            <span className={styles.eyebrow}>Review & Practice</span>
            <h2 className={styles.title}>Mistakes to Review</h2>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className={styles.loadingStack}>
          <Skeleton label="Loading mistakes to review" height={56} />
          <Skeleton height={56} />
        </div>
      ) : isError ? (
        <p role="alert" className={styles.empty}>
          We couldn’t load your mistakes to review just now.
        </p>
      ) : ranked.length === 0 ? (
        /* Deliberately not framed as an achievement. An empty ledger on a new
           account means the tools have not run yet, not that the student
           understands everything, and congratulating them for it would be the
           app's first lie. */
        <div className={styles.empty}>
          <p className={styles.emptyLead}>Nothing on record yet.</p>
          <p className={styles.emptyBody}>
            When the Step-by-Step Solver, Feynman, Common Exam Traps, or a quiz finds a
            mistake, it gets written down here — so you can easily review and conquer it.
          </p>
          <Button variant="secondary" onClick={() => navigate("/solver")}>
            Diagnose a mistake
          </Button>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {shown.map((m) => (
              <li key={m.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowHead}>
                    <span
                      className={`${styles.severity} ${styles[m.severity]}`}
                    >
                      {SEVERITY_LABEL[m.severity]}
                    </span>
                    <h3 className={styles.concept}>{m.concept}</h3>
                    {m.subject && (
                      <span className={styles.subject}>{m.subject}</span>
                    )}
                  </div>

                  {m.summary && <p className={styles.summary}>{m.summary}</p>}

                  <p className={styles.provenance}>
                    {m.timesObserved > 1 ? (
                      <>
                        <strong>Seen {m.timesObserved} times</strong> — first
                        found by {TOOL_LABEL[m.originTool]}
                      </>
                    ) : (
                      <>Found by {TOOL_LABEL[m.originTool]}</>
                    )}
                    {m.timesCorrected > 0 && (
                      <> · got it right {m.timesCorrected}×</>
                    )}
                    {m.status === "improving" && (
                      <span className={styles.improving}> · improving</span>
                    )}
                  </p>
                </div>

                <div className={styles.rowActions}>
                  <Button variant="secondary" onClick={() => handleWorkOnIt(m)}>
                    Work on it
                  </Button>
                  <button
                    type="button"
                    className={styles.dismiss}
                    onClick={() => dismiss.mutate(m.id)}
                    aria-label={`Remove "${m.concept}" from your ledger`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {ranked.length > VISIBLE_ROWS && (
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? "Show fewer"
                : `Show ${ranked.length - VISIBLE_ROWS} more`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
