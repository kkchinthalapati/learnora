import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { ButtonLink } from "../../components/ButtonLink";
import { namedPairForRow, tellApartHref } from "../../lib/confusionPairs";
import { Skeleton } from "../../components/Skeleton";
import { WrongAnswerNote } from "../../components/learning/WrongAnswerNote";
import { ReportProblem } from "../../components/learning/ReportProblem";
import {
  aiRetestQuestion,
  bankRetestQuestion,
  type RetestQuestion,
} from "../../api/retestQuestion";
import { useExams } from "../../hooks/useExams";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useRecordRetest } from "../../hooks/useMistakeLoop";
import { useSettings } from "../../context/settings";
import {
  checkBackOutcome,
  mixUpState,
  onDay,
  shortDate,
  type CheckBackOutcome,
} from "../../lib/checkBack";
import { localDateStr } from "../../lib/date";
import { renderMathText } from "../../lib/markdownToReact";
import { isNamedPattern, mistakeTitle } from "../../lib/mistakeLoop";
import type { Misconception } from "../../lib/misconceptions";
import { questionRef } from "../../lib/questionVetting";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./checkback.module.css";

const KEYS = ["A", "B", "C", "D", "E"];

type Load =
  | { state: "loading" | "none" | "error" }
  | { state: "ready"; q: RetestQuestion };

/* /check-back/:misconceptionId — the delayed retest that proves a mix-up is
 * fixed. Focus mode: no nav; "Not now" is the only way out and costs nothing.
 * One new question, no hints, and then either the Fixed moment or a calm
 * "Not yet". Whether it counts is the loop's rule (lib/checkBack), never
 * this screen's opinion. */
export function CheckBackView() {
  useDocumentTitle("Check-back");
  const { misconceptionId = "" } = useParams<{ misconceptionId: string }>();
  const navigate = useNavigate();
  const { all, isPending } = useMisconceptions();
  /* Held once found, so the refetch after the answer (which may resolve the
     row) doesn't swap the screen out from under the student. */
  const [m, setM] = useState<Misconception | null>(null);
  const found = all.find((x) => x.id === misconceptionId) ?? null;
  useEffect(() => {
    if (!m && found) setM(found);
  }, [m, found]);

  const leave = () => void navigate("/");

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" className={styles.notNow} onClick={leave}>
          Not now
        </button>
        <span className={styles.topTitle}>Check-back · 1 question</span>
      </header>
      <div className={styles.body}>
        {m ? (
          <CheckBack
            m={m}
            fixedSoFar={
              all.filter((x) => x.status === "resolved" && x.id !== m.id).length
            }
          />
        ) : isPending ? (
          <div className={styles.column} aria-busy="true">
            <Skeleton
              label="Loading your check-back"
              height={72}
              radius="var(--radius-md)"
            />
            <Skeleton width="85%" height={26} />
            <Skeleton height={54} radius="var(--radius-md)" />
            <Skeleton height={54} radius="var(--radius-md)" />
          </div>
        ) : (
          <div className={styles.column}>
            <h1 className={styles.heading}>Nothing to check right now</h1>
            <p className={styles.text}>
              This check-back has already been done, or it isn’t ready yet.
            </p>
            <Link to="/" className={styles.link}>
              Back to Today
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function CheckBack({
  m,
  fixedSoFar,
}: {
  m: Misconception;
  fixedSoFar: number;
}) {
  const navigate = useNavigate();
  const exams = useExams();
  const { settings } = useSettings();
  const recordRetest = useRecordRetest();
  /* A mix-up that is two ideas swapped has a second way in. */
  const { all: ledger } = useMisconceptions();
  const pair = namedPairForRow(ledger, m);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState<{
    outcome: CheckBackOutcome;
    queued: boolean;
  } | null>(null);
  const [nudge, setNudge] = useState(false);
  const started = useRef(false);

  async function getQuestion(useAi: boolean) {
    setLoad({ state: "loading" });
    try {
      const q = useAi
        ? await aiRetestQuestion(m, settings)
        : await bankRetestQuestion(
            m,
            exams.data ?? [],
            localDateStr(new Date()),
          );
      setLoad(q ? { state: "ready", q } : { state: "none" });
    } catch {
      setLoad({ state: "error" });
    }
  }

  const ready =
    mixUpState(m, new Date()) === "check_back_ready" || checked !== null;

  /* Wait for exams: the bank question is picked from the student's board.
     Nothing is fetched for a check-back that isn't due. */
  useEffect(() => {
    if (started.current || exams.isPending || !ready) return;
    started.current = true;
    void getQuestion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams.isPending, ready]);
  const belief = isNamedPattern(m) && m.summary ? m.summary : mistakeTitle(m);
  const when = onDay(m.repairedAt ?? m.lastSeenAt, new Date());

  const check = (q: RetestQuestion) => {
    if (checked) return;
    if (picked === null) {
      setNudge(true);
      return;
    }
    const correct = picked === q.correctIndex;
    /* Predicted before the write: the row as it was is what the rule
       judges. */
    const outcome = checkBackOutcome(m, q.question, correct, new Date());
    setChecked({ outcome, queued: false });
    void recordRetest(m, q.question, correct).then((r) =>
      setChecked((c) => (c ? { ...c, queued: r.queued } : c)),
    );
  };

  if (checked?.outcome === "fixed") {
    return (
      <FixedMoment
        m={m}
        belief={isNamedPattern(m) && m.summary ? m.summary : null}
        count={fixedSoFar + 1}
        queued={checked.queued}
        onDone={() => void navigate("/")}
      />
    );
  }

  if (!ready) {
    return (
      <div className={styles.column}>
        <h1 className={styles.heading}>Not ready yet</h1>
        <p className={styles.text}>
          {m.retestDueAt
            ? `This check-back is set for ${shortDate(m.retestDueAt)}. Waiting a couple of days is what makes it proof.`
            : "This one needs a short re-teach before it can be checked."}
        </p>
        <Link to="/" className={styles.link}>
          Back to Today
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.column}>
      <h1 className={styles.srOnly}>Check-back: {mistakeTitle(m)}</h1>
      <p className={styles.context}>
        {when} you thought <strong>{belief}</strong>. This is a new question,
        not the same one.
      </p>

      {load.state === "loading" ? (
        <div aria-busy="true" className={styles.stack}>
          <Skeleton label="Finding a new question" width="85%" height={26} />
          <Skeleton height={54} radius="var(--radius-md)" />
          <Skeleton height={54} radius="var(--radius-md)" />
        </div>
      ) : null}

      {load.state === "none" || load.state === "error" ? (
        <div className={styles.stack}>
          <p className={styles.text}>
            {load.state === "error"
              ? "We couldn’t get a question just now. That’s on our side."
              : "There’s no fresh question in the bank for this one yet."}
          </p>
          <Button variant="secondary" onClick={() => void getQuestion(true)}>
            Write one with AI
          </Button>
        </div>
      ) : null}

      {load.state === "ready" ? (
        <>
          <p className={styles.question}>{renderMathText(load.q.question)}</p>
          <ul className={styles.options} aria-label="Choices">
            {load.q.choices.map((choice, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={styles.option}
                  aria-pressed={picked === i}
                  aria-disabled={checked ? true : undefined}
                  aria-label={
                    checked
                      ? `${KEYS[i]}: ${choice}${
                          picked === i
                            ? `. Your answer · ${i === load.q.correctIndex ? "right" : "not quite"}`
                            : i === load.q.correctIndex
                              ? ". The right answer"
                              : ""
                        }`
                      : undefined
                  }
                  data-result={
                    checked && i === load.q.correctIndex
                      ? "right"
                      : checked && i === picked
                        ? "wrong"
                        : undefined
                  }
                  onClick={() => {
                    if (checked) return;
                    setPicked(i);
                    setNudge(false);
                  }}
                >
                  <span className={styles.key} aria-hidden="true">
                    {KEYS[i]}
                  </span>
                  {renderMathText(choice)}
                </button>
              </li>
            ))}
          </ul>

          {checked ? (
            <div className={styles.feedback} role="status" aria-live="polite">
              {checked.outcome === "improving" ? (
                <>
                  <p className={styles.verdict}>Right</p>
                  <p className={styles.text}>
                    That’s a good sign. It needs one more check-back on a new
                    question before it counts as fixed, so it stays in Fixing.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.verdict}>Not yet</p>
                  <p className={styles.text}>
                    That’s useful to know, not a mark against you. It stays in
                    Fixing: a short re-teach first, then a new check-back in a
                    couple of days.
                  </p>
                  {pair ? (
                    <ButtonLink variant="ghost" className={styles.argue} to={tellApartHref(pair.pair.id)}>
                      Sort {pair.pair.a.term.toLowerCase()} and {pair.pair.b.term.toLowerCase()} side by side
                    </ButtonLink>
                  ) : null}
                </>
              )}
              {checked.queued ? (
                <p className={styles.caption}>
                  Saved on this device. It will sync when you’re back online.
                </p>
              ) : null}
            </div>
          ) : (
            <p className={styles.caption}>
              No hints on a check-back. That’s what makes it proof.
            </p>
          )}

          {checked?.outcome === "not_yet" && picked !== null ? (
            <WrongAnswerNote
              question={{
                question: load.q.question,
                choices: load.q.choices,
                correctIndex: load.q.correctIndex,
                topic: m.concept,
              }}
              chosenIndex={picked}
              explanation={load.q.explanation}
              subject={m.subject}
            />
          ) : null}

          <div className={styles.bar}>
            {checked ? (
              <Button
                variant="primary"
                size="lg"
                className={styles.wide}
                onClick={() => void navigate("/")}
              >
                Back to Today
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className={styles.wide}
                aria-disabled={picked === null || undefined}
                onClick={() => check(load.q)}
              >
                Check
              </Button>
            )}
          </div>
          <p className={styles.nudge} role="status">
            {nudge && picked === null ? "Pick an answer first." : ""}
          </p>
          {load.q.attribution ? (
            <p className={styles.caption}>{load.q.attribution}</p>
          ) : null}
          <ReportProblem
            questionRef={load.q.ref ?? questionRef(load.q)}
            questionText={load.q.question}
          />
        </>
      ) : null}
    </div>
  );
}

/* The Fixed moment: full screen, --success-soft, a 200ms fade and no
   confetti. The timeline is the loop made visible — thought, re-taught,
   proved. */
function FixedMoment({
  m,
  belief,
  count,
  queued,
  onDone,
}: {
  m: Misconception;
  /** The old wrong belief, when it is a named one. */
  belief: string | null;
  count: number;
  queued: boolean;
  onDone: () => void;
}) {
  const title = mistakeTitle(m);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);
  return (
    <section className={styles.fixed} aria-labelledby="fixed-title">
      <p className={styles.srOnly} role="status">
        Fixed: {title}.
      </p>
      <span className={styles.tick} aria-hidden="true">
        ✓
      </span>
      <p className={styles.fixedLabel}>Fixed</p>
      <h1 id="fixed-title" className={styles.fixedTitle}>
        {title}
      </h1>
      {belief ? <p className={styles.text}>No longer: “{belief}”</p> : null}
      <ol className={styles.timeline}>
        <li>
          <span className={styles.when}>{shortDate(m.firstSeenAt)}</span>
          You mixed it up
        </li>
        {m.repairedAt ? (
          <li>
            <span className={styles.when}>{shortDate(m.repairedAt)}</span>
            Re-taught
          </li>
        ) : null}
        <li>
          <span className={styles.when}>Today</span>
          Proved, on a new question
        </li>
      </ol>
      <p className={styles.text}>
        {count === 1
          ? "That’s your first fixed mix-up."
          : `That’s ${count} mix-ups you’ve fixed.`}
      </p>
      {queued ? (
        <p className={styles.caption}>
          Saved on this device. It will sync when you’re back online.
        </p>
      ) : null}
      <Button
        ref={done}
        variant="primary"
        size="lg"
        className={styles.wide}
        onClick={onDone}
      >
        Done
      </Button>
    </section>
  );
}
