import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useRecordTellApart } from "../../hooks/useMistakeLoop";
import {
  activePairs,
  drillOrder,
  isRight,
  ledgerOutcome,
  misses,
  savePairResult,
  type DrillAnswer,
} from "../../lib/confusionPairs";
import { getPair, type ConfusablePair, type PairSideKey } from "../../lib/confusionPairData";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./tellApart.module.css";

/* /tell-apart/:pairId — two ideas students mix up, sorted side by side
 * (lib/confusionPairs.ts). Focus mode like the check-back: "Not now" is the
 * way out and costs nothing. A statement at a time, tap the idea it belongs
 * to, see why straight away. What it writes to the ledger is decided by the
 * pure rules there, and only for rows whose own belief is this confusion. */
export function TellApartView() {
  const { pairId = "" } = useParams<{ pairId: string }>();
  const navigate = useNavigate();
  const pair = getPair(pairId);
  useDocumentTitle(
    pair ? `Tell ${pair.a.term.toLowerCase()} and ${pair.b.term.toLowerCase()} apart` : "Tell apart",
  );

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" className={styles.notNow} onClick={() => void navigate("/")}>
          Not now
        </button>
        <span className={styles.topTitle}>Tell them apart · 6 statements</span>
      </header>
      <div className={styles.body}>
        {pair ? (
          <Drill pair={pair} />
        ) : (
          <div className={styles.column}>
            <h1 className={styles.heading}>We don’t have that pair</h1>
            <p className={styles.text}>The link may be out of date.</p>
            <Link to="/" className={styles.link}>
              Back to Home
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Contrast({ pair }: { pair: ConfusablePair }) {
  return (
    <div className={styles.contrast}>
      {(["a", "b"] as const).map((k) => (
        <section key={k} className={styles.side} aria-label={pair[k].term}>
          <h2 className={styles.term}>{pair[k].term}</h2>
          <p className={styles.tell}>{pair[k].tell}</p>
        </section>
      ))}
    </div>
  );
}

type Phase = "intro" | "drill" | "done";

function Drill({ pair }: { pair: ConfusablePair }) {
  const navigate = useNavigate();
  const { all, isPending } = useMisconceptions();
  const record = useRecordTellApart();
  const seed = useRef(Math.floor(Math.random() * 2 ** 31));
  const runId = useRef(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const finished = useRef(false);
  const order = useMemo(() => drillOrder(pair, seed.current), [pair]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [answers, setAnswers] = useState<DrillAnswer[]>([]);
  const [picked, setPicked] = useState<PairSideKey | null>(null);
  const [wrote, setWrote] = useState<"evidence" | "correction" | null>(null);

  const index = answers.length;
  const statement = order[index];

  /* Only a named confusion has a ledger row that is *this* mix-up. */
  const named = activePairs(all).find((p) => p.pair.id === pair.id && p.kind === "named") ?? null;

  function choose(side: PairSideKey) {
    if (picked !== null || !statement) return;
    setPicked(side);
  }

  function next() {
    if (picked === null || !statement) return;
    const answer: DrillAnswer = { statement, picked };
    const done = [...answers, answer];
    setAnswers(done);
    setPicked(null);
    if (done.length < order.length) return;
    setPhase("done");
    if (finished.current) return;
    finished.current = true;
    const right = done.filter(isRight).length;
    savePairResult(pair.id, right, done.length);
    const outcome = ledgerOutcome(done);
    if (named && outcome !== "none") {
      void record(named.rows, outcome, {
        runId: runId.current,
        firstMiss: misses(done)[0]?.statement.text,
      }).then((ok) => setWrote(ok ? outcome : null));
    }
  }

  if (isPending && phase === "intro") {
    return (
      <div className={styles.column} aria-busy="true">
        <Skeleton label="Getting the pair ready" height={96} radius="var(--r-md)" />
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className={styles.column}>
        <h1 className={styles.heading}>
          {pair.a.term} or {pair.b.term.toLowerCase()}?
        </h1>
        <p className={styles.text}>
          {named
            ? "These two have been getting mixed up. "
            : "These two are easy to swap in an exam. "}
          {pair.difference}
        </p>
        <Contrast pair={pair} />
        <p className={styles.caption}>
          Six statements, each belongs to one of them. Tap which. You’ll see why straight away.
        </p>
        <Button variant="primary" size="lg" className={styles.wide} onClick={() => setPhase("drill")}>
          Start
        </Button>
      </div>
    );
  }

  if (phase === "done") {
    const right = answers.filter(isRight).length;
    const missed = misses(answers);
    return (
      <div className={styles.column}>
        <h1 className={styles.heading}>
          {right} of {answers.length} sorted right
        </h1>
        {missed.length === 0 ? (
          <p className={styles.text}>No mix-ups this time.</p>
        ) : (
          <ul className={styles.missList} aria-label="The ones to look at again">
            {missed.map((m) => (
              <li key={m.statement.text} className={styles.miss}>
                <p className={styles.statementSmall}>{m.statement.text}</p>
                <p className={styles.text}>
                  Belongs to <strong>{pair[m.statement.side].term}</strong>. {m.statement.why}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Contrast pair={pair} />
        {wrote === "evidence" ? (
          <p className={styles.caption} role="status">
            That’s the same mix-up showing up again, so it stays on your list.
          </p>
        ) : wrote === "correction" ? (
          <p className={styles.caption} role="status">
            That counts in your favour. It only counts as fixed after a check-back on a new question.
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button variant="primary" size="lg" className={styles.wide} onClick={() => void navigate("/")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const sure = picked !== null && statement ? picked === statement.side : null;
  return (
    <div className={styles.column}>
      <p className={styles.progress} aria-live="polite">
        {index + 1} of {order.length}
      </p>
      <p className={styles.statement}>{statement.text}</p>
      <div className={styles.choices} role="group" aria-label="Which one is it?">
        {(["a", "b"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={styles.choice}
            aria-pressed={picked === k}
            aria-disabled={picked !== null ? true : undefined}
            data-result={
              picked === null ? undefined : k === statement.side ? "right" : picked === k ? "wrong" : undefined
            }
            onClick={() => choose(k)}
          >
            {pair[k].term}
          </button>
        ))}
      </div>
      <div className={styles.feedback} role="status" aria-live="polite">
        {picked !== null ? (
          <>
            <p className={styles.verdict}>
              {sure ? "Right" : `Not quite: it’s ${pair[statement.side].term}`}
            </p>
            <p className={styles.text}>{statement.why}</p>
          </>
        ) : null}
      </div>
      <Button
        variant="primary"
        size="lg"
        className={styles.wide}
        aria-disabled={picked === null || undefined}
        onClick={next}
      >
        {index + 1 === order.length ? "See how it went" : "Next"}
      </Button>
    </div>
  );
}
