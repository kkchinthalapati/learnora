import { useMemo, useState, type PointerEvent } from "react";
import { Link } from "react-router";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useAllDecks } from "../../hooks/useDecks";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { formatDueDate, localDateStr } from "../../lib/date";
import {
  computeRetention,
  CURVE_DAYS,
  MIN_REVIEWED_PER_DECK,
  TARGET_RECALL,
  type DeckRetention,
} from "./retention";
import styles from "./analytics.module.css";
import own from "./retention.module.css";

/* Memory & retention — Progress › History.
 *
 * Everything here is the flashcard scheduler's own forgetting model read
 * back (see retention.ts): no AI call, no separate formula. Where there is
 * not enough review data for a number to mean anything, it says so instead
 * of showing one. */

const pct = (r: number) => `${Math.round(r * 100)}%`;

function when(date: Date, now: Date): string {
  if (date.getTime() <= now.getTime()) return "Now";
  return formatDueDate(localDateStr(date), localDateStr(now));
}

export function RetentionInsights() {
  const { data: cards = [], isPending: cardsPending, isError } = useFlashcards();
  const { data: decks = [], isPending: decksPending } = useAllDecks();
  const { ranked: misconceptions } = useMisconceptions();

  // "Now" is fixed per load of the data, so every figure below agrees on it.
  const { summary, now } = useMemo(() => {
    const at = new Date();
    return { summary: computeRetention(cards, decks, at), now: at };
  }, [cards, decks]);

  /* One shared floor for every deck's curve, so the small multiples can be
     compared at a glance — a steeper line is a faster fade, not a rescale. */
  const floor = useMemo(() => {
    const lows = summary.decks.flatMap((d) => (d.curve ? [Math.min(...d.curve)] : []));
    const low = lows.length ? Math.min(...lows) : 0.5;
    return Math.max(0, Math.min(0.5, Math.floor(low * 10) / 10));
  }, [summary]);

  return (
    <Card
      as="section"
      variant="panel"
      padding="lg"
      className={styles.sectionCard}
      aria-labelledby="retention-heading"
    >
      <div className={styles.sectionHeader}>
        <div>
          <h3 id="retention-heading" className={styles.sectionTitle}>
            Memory & retention
          </h3>
          <p className={styles.sectionSub}>
            How well your flashcards are sticking, from the review scheduler's own
            forecast
          </p>
        </div>
        <span className={styles.statBadge}>
          <Icon name="brain" size={14} /> From your reviews
        </span>
      </div>

      {cardsPending || decksPending ? (
        <Skeleton label="Working out your retention" height={160} />
      ) : isError ? (
        <p className={own.empty} role="alert">
          Couldn't load your flashcards just now. Try again in a moment.
        </p>
      ) : summary.totalCards === 0 ? (
        <p className={own.empty}>
          No flashcards yet. <Link to="/library/flashcards">Make a deck</Link> and review
          it, and this will show how well you're remembering it.
        </p>
      ) : summary.reviewedCards === 0 ? (
        <p className={own.empty}>
          Not enough reviews yet. You have {summary.due.newCards} card
          {summary.due.newCards === 1 ? "" : "s"} waiting for a first review —{" "}
          <Link to="/review/daily-drill">review a few</Link> and this will estimate how well you
          remember them.
        </p>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={own.tile}>
              <span className={styles.statEyebrow}>Due now</span>
              <p className={styles.statValue}>{summary.due.dueNow}</p>
              <span className={own.tileSub}>
                {summary.due.overdue > 0
                  ? `${summary.due.overdue} overdue`
                  : summary.due.dueNow > 0
                    ? "Due today"
                    : "All caught up"}
                {summary.due.newCards > 0 ? ` · ${summary.due.newCards} new` : ""}
              </span>
            </div>
            <div className={own.tile}>
              <span className={styles.statEyebrow}>Due in the next 7 days</span>
              <p className={styles.statValue}>{summary.due.dueNext7}</p>
              <span className={own.tileSub}>Not counting what's due now</span>
            </div>
            <div className={own.tile}>
              <span className={styles.statEyebrow}>Predicted recall now</span>
              <p className={styles.statValue}>
                {summary.recallNow === null ? "—" : pct(summary.recallNow)}
              </p>
              <span className={own.tileSub}>
                {summary.recallNow === null
                  ? `Not enough reviews yet (${summary.reviewedCards} of ${MIN_REVIEWED_PER_DECK})`
                  : `Across ${summary.reviewedCards} reviewed cards · target ${pct(TARGET_RECALL)}`}
              </span>
            </div>
            <div className={own.tile}>
              <span className={styles.statEyebrow}>Recommended next review</span>
              <p className={styles.statValue}>
                {summary.nextReview ? when(summary.nextReview.at, now) : "—"}
              </p>
              <span className={own.tileSub}>
                {summary.nextReview ? (
                  <>
                    {summary.nextReview.count} card
                    {summary.nextReview.count === 1 ? "" : "s"}
                    {summary.nextReview.at.getTime() <= now.getTime() ? (
                      <>
                        {" "}· <Link to="/review/daily-drill">Review now</Link>
                      </>
                    ) : (
                      " fall due then"
                    )}
                  </>
                ) : (
                  "Nothing scheduled"
                )}
              </span>
            </div>
          </div>

          <div className={own.grid}>
            <DueForecast days={summary.dueByDay} now={now} />
            <WeakestTopics
              decks={summary.weakestDecks}
              misconceptions={misconceptions.slice(0, 3).map((m) => ({
                id: m.id,
                concept: m.concept,
                subject: m.subject,
                times: m.timesObserved,
              }))}
            />
          </div>

          <h4 className={own.subheading}>Forgetting curve by deck</h4>
          <p className={own.caption}>
            Predicted recall over the next {CURVE_DAYS} days if you don't review. The
            dashed line is the {pct(TARGET_RECALL)} point where the scheduler brings a
            card back.
          </p>
          <div className={own.tableWrap}>
            <table className={own.table}>
              <caption className={styles.srOnly}>
                Predicted recall and next review for each flashcard deck
              </caption>
              <thead>
                <tr>
                  <th scope="col">Deck</th>
                  <th scope="col">Reviewed</th>
                  <th scope="col">Recall now</th>
                  <th scope="col">In 7 days</th>
                  <th scope="col">Next {CURVE_DAYS} days</th>
                  <th scope="col">Next review</th>
                </tr>
              </thead>
              <tbody>
                {summary.decks.map((deck) => (
                  <DeckRow key={deck.deckId} deck={deck} floor={floor} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function DeckRow({ deck, floor, now }: { deck: DeckRetention; floor: number; now: Date }) {
  return (
    <tr>
      <th scope="row" className={own.deckName}>
        {deck.title}
      </th>
      <td>
        {deck.reviewedCards} / {deck.totalCards}
      </td>
      {deck.enoughData && deck.curve ? (
        <>
          <td>{pct(deck.recallNow!)}</td>
          <td>{pct(deck.recallIn7Days!)}</td>
          <td>
            <Sparkline curve={deck.curve} floor={floor} deck={deck.title} />
          </td>
        </>
      ) : (
        <td colSpan={3} className={own.muted}>
          Not enough reviews yet ({deck.reviewedCards} of {MIN_REVIEWED_PER_DECK})
        </td>
      )}
      <td>{deck.nextReview ? when(deck.nextReview, now) : "—"}</td>
    </tr>
  );
}

const SPARK_W = 160;
const SPARK_H = 40;
const PAD = 3;

/** One deck's forgetting curve: single series, accent line, the scheduler's
 *  target as a dashed rule, and a hover readout of any day. */
function Sparkline({ curve, floor, deck }: { curve: number[]; floor: number; deck: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD + (i / (curve.length - 1)) * (SPARK_W - PAD * 2);
  const y = (r: number) =>
    PAD + (1 - (Math.max(floor, r) - floor) / (1 - floor)) * (SPARK_H - PAD * 2);
  const points = curve.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const last = curve.length - 1;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / Math.max(1, box.width);
    setHover(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };

  return (
    <span className={own.spark}>
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        width={SPARK_W}
        height={SPARK_H}
        role="img"
        aria-label={`${deck}: predicted recall ${pct(curve[0])} now, ${pct(curve[last])} in ${last} days without review`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1={PAD}
          x2={SPARK_W - PAD}
          y1={y(TARGET_RECALL)}
          y2={y(TARGET_RECALL)}
          className={own.target}
        />
        <polyline points={points} className={own.curve} />
        {hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={SPARK_H - PAD} className={own.crosshair} />
            <circle cx={x(hover)} cy={y(curve[hover])} r={4} className={own.dot} />
          </>
        ) : null}
      </svg>
      {hover !== null ? (
        <span className={own.tooltip} role="status">
          {hover === 0 ? "Now" : `In ${hover} day${hover === 1 ? "" : "s"}`}: {pct(curve[hover])}
        </span>
      ) : null}
    </span>
  );
}

function DueForecast({ days, now }: { days: { date: Date; count: number }[]; now: Date }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (d: Date, i: number) =>
    i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
  const total = days.reduce((n, d) => n + d.count, 0);

  return (
    <div>
      <h4 className={own.subheading}>Reviews due, next 7 days</h4>
      <div className={styles.chartContainer}>
        <div
          className={styles.barsContainer}
          role="group"
          aria-label="Flashcard reviews due on each of the next 7 days"
        >
          {total === 0 && (
            <p className={styles.chartEmptyMessage}>Nothing falls due this week.</p>
          )}
          {days.map((d, i) => (
            <button
              type="button"
              key={d.date.toISOString()}
              className={styles.barCol}
              title={`${label(d.date, i)}: ${d.count} due`}
              aria-label={`${label(d.date, i)}: ${d.count} review${d.count === 1 ? "" : "s"} due${i === 0 ? ", including overdue" : ""}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              {d.count > 0 ? (
                <span className={own.barValue} aria-hidden="true">
                  {d.count}
                </span>
              ) : null}
              {/* A day with nothing due draws no bar at all — a sliver would
                  read as "a few". */}
              <div
                className={`${styles.barFill} ${own.dueBar}${d.count === 0 ? ` ${own.dueBarEmpty}` : ""}`}
                style={{
                  height: d.count === 0 ? 0 : `${Math.max(4, Math.round((d.count / max) * 85))}%`,
                }}
              />
              <span className={styles.barLabel}>{label(d.date, i)}</span>
            </button>
          ))}
        </div>
      </div>
      {selected !== null ? (
        <p className={styles.hourDetail} role="status">
          <strong>{formatDueDate(localDateStr(days[selected].date), localDateStr(now))}</strong>
          : {days[selected].count} review{days[selected].count === 1 ? "" : "s"} due
          {selected === 0 ? ", including anything overdue." : "."}
        </p>
      ) : null}
    </div>
  );
}

function WeakestTopics({
  decks,
  misconceptions,
}: {
  decks: DeckRetention[];
  misconceptions: { id: string; concept: string; subject: string; times: number }[];
}) {
  return (
    <div>
      <h4 className={own.subheading}>Weakest topics</h4>
      {decks.length === 0 ? (
        <p className={own.muted}>
          Not enough reviews yet to rank your decks — each needs at least{" "}
          {MIN_REVIEWED_PER_DECK} reviewed cards.
        </p>
      ) : (
        <ul className={own.list}>
          {decks.map((d) => (
            <li key={d.deckId}>
              <span className={own.listName}>{d.title}</span>
              <span className={own.listValue}>
                {pct(d.recallNow!)} now → {pct(d.recallIn7Days!)} in a week
              </span>
            </li>
          ))}
        </ul>
      )}
      {misconceptions.length > 0 ? (
        <>
          <h5 className={own.minorHeading}>Open misconceptions</h5>
          <ul className={own.list}>
            {misconceptions.map((m) => (
              <li key={m.id}>
                <span className={own.listName}>{m.concept}</span>
                <span className={own.listValue}>
                  {m.subject} · seen {m.times}×
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
