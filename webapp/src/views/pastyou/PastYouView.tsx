import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { ProgressRing } from "../../components/ProgressRing";
import { Skeleton } from "../../components/Skeleton";
import { AiError } from "../../api/ai";
import {
  newPastYouSessionKey,
  pastYouSays,
  type PastYouTurn,
} from "../../api/aiPastYou";
import { useSettings } from "../../context/settings";
import {
  useMisconceptionObservations,
  useMisconceptions,
} from "../../hooks/useMisconceptions";
import { useRecordPastYou } from "../../hooks/useMistakeLoop";
import { shortDate } from "../../lib/checkBack";
import type { Misconception } from "../../lib/misconceptions";
import {
  beliefClause,
  canArguePastYou,
  correctIdeaFor,
  isConvinced,
  MAX_TURNS,
  MIN_ARGUMENT_WORDS,
  nextBelief,
  pastYouDate,
  START_BELIEF,
  wordCount,
} from "../../lib/pastYou";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./pastYou.module.css";

/* /past-you/:misconceptionId — "Talk past you out of it" (lib/pastYou.ts).
 * Focus mode like the check-back: no nav, "Not now" is the way out and costs
 * nothing. Past you opens by saying what they believed, in their own words
 * from the ledger; the student argues; the ring shows how sure past you
 * still is. A concession is a re-teach, written to the ledger as one, and
 * points at the check-back that will prove it stuck. */
export function PastYouView() {
  useDocumentTitle("Talk past you out of it");
  const { misconceptionId = "" } = useParams<{ misconceptionId: string }>();
  const navigate = useNavigate();
  const { all, isPending } = useMisconceptions();
  /* Held once found, so the refetch after the concession is recorded
     doesn't swap the screen out from under the student. */
  const [m, setM] = useState<Misconception | null>(null);
  const found = all.find((x) => x.id === misconceptionId) ?? null;
  useEffect(() => {
    if (!m && found) setM(found);
  }, [m, found]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" className={styles.notNow} onClick={() => void navigate("/")}>
          Not now
        </button>
        <span className={styles.topTitle}>Talk past you out of it</span>
      </header>
      <div className={styles.body}>
        {m && canArguePastYou(m) ? (
          <Argument m={m} />
        ) : m ? (
          <Nothing
            title="There’s no belief to argue with here"
            text="This one was a slip rather than a wrong idea, so past you has nothing to defend."
          />
        ) : isPending ? (
          <div className={styles.column} aria-busy="true">
            <Skeleton label="Finding past you" height={72} radius="var(--r-md)" />
            <Skeleton width="70%" height={20} />
          </div>
        ) : (
          <Nothing
            title="Nothing to argue about here"
            text="This mix-up has been fixed or removed from your list."
          />
        )}
      </div>
    </main>
  );
}

function Nothing({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.column}>
      <h1 className={styles.heading}>{title}</h1>
      <p className={styles.text}>{text}</p>
      <Link to="/" className={styles.link}>
        Back to Home
      </Link>
    </div>
  );
}

type Phase =
  | { kind: "thinking" }
  | { kind: "listening" }
  | { kind: "error"; message: string }
  | { kind: "convinced"; checkBackAt: string | null }
  | { kind: "out" };

interface PastLine {
  /** How sure past you is after this line, already capped. */
  belief: number;
  landed: string;
}

function Argument({ m }: { m: Misconception }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const recordPastYou = useRecordPastYou();
  const observations = useMisconceptionObservations(m.id);
  const sessionKey = useRef(newPastYouSessionKey(m.id));
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);
  /* The argument that moved past you most, quoted in the ledger. */
  const best = useRef({ drop: 0, text: "" });
  const [turns, setTurns] = useState<PastYouTurn[]>([]);
  const [lines, setLines] = useState<PastLine[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "thinking" });
  const [draft, setDraft] = useState("");
  const [nudge, setNudge] = useState(false);
  const [peek, setPeek] = useState(false);

  const when = pastYouDate(m);
  const belief = lines.at(-1)?.belief ?? START_BELIEF;
  const sent = turns.filter((t) => t.from === "you").length;
  const rightIdea = correctIdeaFor(m);
  const evidence = (observations.data ?? [])
    .filter((o) => o.kind === "evidence")
    .map((o) => o.detail);

  async function ask(sofar: PastYouTurn[], before: PastLine[]) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: "thinking" });
    try {
      const line = await pastYouSays(
        m,
        evidence,
        sofar,
        before.map((l) => l.belief),
        sessionKey.current,
        settings,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const last = sofar.at(-1);
      const previous = before.at(-1)?.belief ?? START_BELIEF;
      /* The opener states the belief; it can't have been argued yet. */
      const now = last?.from === "you" ? nextBelief(previous, line.belief, last.text) : START_BELIEF;
      if (last?.from === "you" && previous - now > best.current.drop) {
        best.current = { drop: previous - now, text: last.text };
      }
      const nextLines = [...before, { belief: now, landed: now < previous ? line.landed : "" }];
      setTurns([...sofar, { from: "past", text: line.reply }]);
      setLines(nextLines);
      if (isConvinced(now)) {
        const checkBackAt = recordPastYou(m, {
          sessionId: sessionKey.current,
          argument: best.current.text || last?.text || "",
        });
        setPhase({ kind: "convinced", checkBackAt });
      } else if (sofar.filter((t) => t.from === "you").length >= MAX_TURNS) {
        setPhase({ kind: "out" });
      } else {
        setPhase({ kind: "listening" });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "error",
        message:
          err instanceof AiError && !err.retryable
            ? err.message
            : "Past you didn’t answer. That’s on our side, not yours.",
      });
    }
  }

  /* Wait for the evidence trail (or its failure): past you opens by quoting
     what actually happened, and starting without it would waste the call. */
  useEffect(() => {
    if (started.current || observations.isPending) return;
    started.current = true;
    void ask([], []);
    /* Leaving stops whatever past you is in the middle of. Resetting
       `started` lets StrictMode's remount open the conversation again
       rather than wait on the request its cleanup just cancelled. */
    return () => {
      started.current = false;
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.isPending]);

  function send(e?: FormEvent) {
    e?.preventDefault();
    if (phase.kind !== "listening") return;
    const text = draft.trim();
    if (wordCount(text) < MIN_ARGUMENT_WORDS) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setDraft("");
    const sofar: PastYouTurn[] = [...turns, { from: "you", text }];
    setTurns(sofar);
    void ask(sofar, lines);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function retry() {
    void ask(turns, lines);
  }

  function again() {
    best.current = { drop: 0, text: "" };
    setTurns([]);
    setLines([]);
    setPeek(false);
    void ask([], []);
  }

  if (phase.kind === "convinced") {
    return (
      <Convinced
        m={m}
        when={when}
        concession={turns.at(-1)?.text ?? ""}
        checkBackAt={phase.checkBackAt}
        onDone={() => void navigate("/")}
      />
    );
  }

  return (
    <div className={styles.column}>
      <h1 className={styles.heading}>{m.concept}</h1>
      <div className={styles.setup}>
        <p className={styles.context}>
          On {when} you thought <strong>{beliefClause(m.summary)}</strong>. Past you still
          does. Explain why it’s wrong until they come round.
        </p>
        <div className={styles.meter}>
          <ProgressRing
            value={belief / 100}
            center={String(belief)}
            label={`Past you is ${belief}% sure of the old idea`}
          />
          <span className={styles.meterLabel}>
            How sure
            <br />
            past you is
          </span>
        </div>
      </div>

      <div role="log" aria-label="Your argument with past you">
        <ol className={styles.log}>
          {turns.map((t, i) => {
            const pastIndex = turns.slice(0, i + 1).filter((x) => x.from === "past").length - 1;
            const landed = t.from === "past" ? lines[pastIndex]?.landed : "";
            return (
              <li key={i} className={styles.turn} data-from={t.from}>
                <span className={styles.who}>{t.from === "past" ? `You · ${when}` : "You · now"}</span>
                <p className={styles.said}>{t.text}</p>
                {landed ? <p className={styles.landed}>✓ Got through: {landed}</p> : null}
              </li>
            );
          })}
          {phase.kind === "thinking" ? (
            <li className={styles.turn} data-from="past" aria-busy="true">
              <span className={styles.who}>You · {when}</span>
              <Skeleton label="Past you is thinking" width="80%" height={18} />
              <Skeleton width="55%" height={18} />
            </li>
          ) : null}
        </ol>
      </div>

      {phase.kind === "error" ? (
        <div className={styles.panel} role="alert">
          <p className={styles.text}>{phase.message}</p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {phase.kind === "out" ? (
        <div className={styles.panel} role="status">
          <p className={styles.verdict}>Past you isn’t convinced yet</p>
          <p className={styles.text}>
            That’s normal for an idea that has felt true for a while. Nothing
            is recorded against you.
            {rightIdea ? " Here’s the idea they still need:" : ""}
          </p>
          {rightIdea ? <p className={styles.rightIdea}>{rightIdea}</p> : null}
          <div className={styles.actions}>
            <Button variant="primary" onClick={again}>
              Argue again
            </Button>
            <Button variant="ghost" onClick={() => void navigate("/")}>
              Back to Home
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "listening" || phase.kind === "thinking" ? (
        <form className={styles.composer} onSubmit={send}>
          <label htmlFor="past-you-draft" className={styles.srOnly}>
            Your argument
          </label>
          <textarea
            id="past-you-draft"
            className={styles.draft}
            rows={3}
            value={draft}
            placeholder="Tell past you why that’s wrong…"
            onChange={(e) => {
              setDraft(e.target.value);
              if (nudge) setNudge(false);
            }}
            onKeyDown={onKeyDown}
          />
          <div className={styles.composerBar}>
            <span className={styles.caption}>
              {MAX_TURNS - sent} of {MAX_TURNS} messages left
            </span>
            {rightIdea && !peek && sent >= 2 ? (
              <Button variant="ghost" size="sm" onClick={() => setPeek(true)}>
                Show me the right idea
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              aria-disabled={phase.kind !== "listening" || !draft.trim() || undefined}
            >
              Send
            </Button>
          </div>
          {peek ? <p className={styles.rightIdea}>{rightIdea}</p> : null}
          <p className={styles.caption} role="status">
            {nudge ? "Give past you a reason. A few words won’t move them." : ""}
          </p>
        </form>
      ) : null}
    </div>
  );
}

/* Past you came round. Not the Fixed moment: an argument is a re-teach, and
   only the check-back on a new question can say it stuck. */
function Convinced({
  m,
  when,
  concession,
  checkBackAt,
  onDone,
}: {
  m: Misconception;
  when: string;
  concession: string;
  checkBackAt: string | null;
  onDone: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);
  return (
    <section className={styles.convinced} aria-labelledby="convinced-title">
      <p className={styles.srOnly} role="status">
        Past you is convinced.
      </p>
      <p className={styles.convincedLabel}>Convinced</p>
      <h1 id="convinced-title" className={styles.convincedTitle}>
        You talked yourself out of it
      </h1>
      {concession ? (
        <blockquote className={styles.concession}>
          <p>{concession}</p>
          <footer className={styles.who}>You · {when}</footer>
        </blockquote>
      ) : null}
      <ol className={styles.timeline}>
        <li>
          <span className={styles.when}>{when}</span>
          You thought: {beliefClause(m.summary)}
        </li>
        <li>
          <span className={styles.when}>Today</span>
          You argued it out
        </li>
        <li>
          <span className={styles.when}>{checkBackAt ? shortDate(checkBackAt) : "Next"}</span>
          A check-back on a new question proves it stuck
        </li>
      </ol>
      <Button ref={done} variant="primary" size="lg" className={styles.wide} onClick={onDone}>
        Done
      </Button>
    </section>
  );
}
