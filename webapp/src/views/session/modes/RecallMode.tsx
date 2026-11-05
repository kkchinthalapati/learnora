import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../../components/Button";
import { newSessionHref } from "../../../lib/sessionModes";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import type { Flashcard } from "../../../api/types";
import { useAllDecks } from "../../../hooks/useDecks";
import { useAllDueFlashcards, useUpdateFlashcardReview } from "../../../hooks/useFlashcards";
import { useToast } from "../../../context/toast";
import { nextReviewState } from "../../review/srs";
import { SessionComposer } from "../SessionComposer";
import { checkRecall, isOverrated, pickRecallCards, RECALL_RATINGS } from "./recall";
import type { ModeProps } from "../modeTypes";
import text from "../../../styles/text.module.css";
import styles from "../session.module.css";

const BLOCK = 6;

export interface RecallData {
  cardIds: string[];
  index: number;
  revealed: boolean;
  typed?: string;
  /** Answers typed before revealing, across the session. */
  typedCount?: number;
  /** Cards kept at "Got it" although the typed answer didn't support it. */
  overrated?: string[];
}

export function RecallMode({ session, ctl, onSwitchMode }: ModeProps) {
  const dueQuery = useAllDueFlashcards(50);
  const decks = useAllDecks();
  const updateReview = useUpdateFlashcardReview();
  const { showToast } = useToast();
  const data = session.data.recall as RecallData | undefined;
  const [picked, setPicked] = useState<Flashcard[] | null>(null);

  const deckTitle = useCallback(
    (id: string | null) => decks.data?.find((d) => d.id === id)?.title ?? "Cards",
    [decks.data],
  );

  /* Fix the deck on first load; a resumed session keeps the same cards, in
     the same order, even as reviews move them out of "due". */
  useEffect(() => {
    if (!dueQuery.data || picked) return;
    const byId = new Map(dueQuery.data.map((c) => [c.id, c]));
    if (data?.cardIds.length) {
      setPicked(data.cardIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c)));
      return;
    }
    const cards = pickRecallCards(dueQuery.data, session.objective, deckTitle);
    setPicked(cards);
    if (cards.length) {
      const blocks = Math.ceil(cards.length / BLOCK);
      ctl.update((s) => ({
        ...s,
        plan: Array.from({ length: blocks }, (_, i) => ({
          id: `b${i}`,
          label: `Cards ${i * BLOCK + 1}–${Math.min((i + 1) * BLOCK, cards.length)}`,
        })),
        currentStep: 0,
        data: { ...s.data, recall: { cardIds: cards.map((c) => c.id), index: 0, revealed: false } },
      }));
    }
  }, [dueQuery.data, picked, data, session.objective, deckTitle, ctl]);

  const cards = picked ?? [];
  const index = data?.index ?? 0;
  const card = cards[index];
  const revealed = data?.revealed ?? false;
  const done = session.status === "done" || (cards.length > 0 && index >= cards.length);
  const check = useMemo(
    () => (revealed && card ? checkRecall(data?.typed, card.back) : null),
    [revealed, card, data?.typed],
  );
  /* Asking once before a "Got it" the typed answer doesn't support. */
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [index]);

  const save = useCallback(
    (patch: Partial<RecallData>) =>
      ctl.update((s) => ({
        ...s,
        data: {
          ...s.data,
          recall: { ...(s.data.recall as RecallData), ...patch },
        },
      })),
    [ctl],
  );

  const reveal = useCallback(() => {
    if (card && !revealed) save({ revealed: true });
  }, [card, revealed, save]);

  const rate = useCallback(
    (quality: number, confirmed = false) => {
      if (!card || !revealed) return;
      if (isOverrated(check, quality) && !confirmed) {
        setConfirming(true);
        return;
      }
      const kept = isOverrated(check, quality);
      const next = nextReviewState(card, quality);
      updateReview.mutate(
        {
          cardId: card.id,
          nextReviewDate: next.nextReviewDate,
          interval: next.interval,
          ease: next.ease,
          stability: next.stability,
          difficulty: next.difficulty,
        },
        {
          onError: () =>
            showToast(
              "Couldn't save this card's rating. It may come up again sooner than it should.",
              { error: true },
            ),
        },
      );
      const nextIndex = index + 1;
      ctl.update((s) => ({
        ...s,
        currentStep: Math.min(Math.floor(nextIndex / BLOCK), s.plan.length),
        status: nextIndex >= cards.length ? "done" : s.status,
        data: {
          ...s.data,
          recall: {
            ...(s.data.recall as RecallData),
            index: nextIndex,
            revealed: false,
            typed: undefined,
            typedCount: ((s.data.recall as RecallData).typedCount ?? 0) + (check ? 1 : 0),
            overrated: kept
              ? [...((s.data.recall as RecallData).overrated ?? []), card.id]
              : (s.data.recall as RecallData).overrated,
          },
        },
      }));
    },
    [card, revealed, check, updateReview, showToast, index, ctl, cards.length],
  );

  /* Space reveals; 1 · 2 · 3 rate. Not while typing in the composer. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key === " " && !revealed) {
        e.preventDefault();
        reveal();
        return;
      }
      const rating = RECALL_RATINGS.find((r) => r.key === e.key);
      // While asking, 3 keeps "Got it" and any other rating key replaces it.
      if (rating && revealed) rate(rating.quality, confirming);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal, rate, revealed, confirming]);

  const typedCount = data?.typedCount ?? 0;
  const secondLook = (data?.overrated ?? [])
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Flashcard => Boolean(c));

  if (dueQuery.isPending || !picked) {
    return (
      <div className={styles.scroll}>
        <div className={`${styles.column} ${styles.recall}`}>
          <Skeleton label="Picking the cards that are due" width={560} height={240} radius="var(--r-lg)" />
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className={styles.scroll}>
        <div className={styles.column}>
          <EmptyState
            title="Nothing is due right now."
            message="Everything you've learned is holding. Practice will stretch you instead."
          >
            <Button variant="primary" onClick={() => onSwitchMode("practice")}>
              Practise {session.objective}
            </Button>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.scroll}>
        <div className={`${styles.column} ${styles.recall}`}>
          {done ? (
            <EmptyState
              title="That's the set."
              message={`${cards.length} cards reviewed. Each one is rescheduled for when it would start to slip.${
                typedCount
                  ? ` You typed ${typedCount} of ${cards.length} answers, so those ratings were checked against what you wrote.`
                  : " Next time, type each answer before revealing it, and your ratings are checked against what you wrote."
              }`}
            >
              {secondLook.length > 0 ? (
                <div className={styles.secondLook}>
                  <p className={styles.caption}>
                    You kept these at “Got it”, but your answer left out key words. Worth a second look:
                  </p>
                  <ul>
                    {secondLook.map((c) => (
                      <li key={c.id}>
                        {c.front}{" "}
                        <Link to={newSessionHref("explain", { topic: c.front })} className={styles.secondLookLink}>
                          Go over it
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </EmptyState>
          ) : card ? (
            <>
              <span className={text.meta}>
                {index + 1} / {cards.length} · mixed
              </span>
              <div className={styles.recallCard}>
                <span className={`${text.meta} ${text.recall}`}>{deckTitle(card.deck_id)}</span>
                <p className={styles.recallPrompt}>{card.front}</p>
                {revealed ? (
                  <>
                    {data?.typed ? (
                      <p className={styles.caption}>You said: {data.typed}</p>
                    ) : null}
                    {check ? (
                      <p className={styles.recallCheck}>
                        {check.missed.length === 0 ? (
                          "Your answer has every key word on the card."
                        ) : (
                          <>
                            Not in your answer: <strong>{check.missed.slice(0, 6).join(", ")}</strong>
                          </>
                        )}
                      </p>
                    ) : null}
                    <p className={styles.recallAnswer}>{card.back}</p>
                  </>
                ) : (
                  <p className={styles.caption}>Say it or type it before revealing.</p>
                )}
              </div>
              {revealed && confirming && check ? (
                <div className={styles.ratingConfirm} role="group" aria-label="Check your rating">
                  <p className={styles.caption}>
                    Your answer didn't include <strong>{check.missed.slice(0, 4).join(", ")}</strong>.
                    “Got it” moves this card weeks away. Did you know it anyway?
                  </p>
                  <div className={styles.ratings}>
                    <button type="button" className={styles.rating} onClick={() => rate(3, true)}>
                      Yes, I knew it
                      <span className={styles.ratingKey} aria-hidden="true">3</span>
                    </button>
                    <button type="button" className={styles.rating} onClick={() => rate(2)}>
                      Count it as Hard
                      <span className={styles.ratingKey} aria-hidden="true">2</span>
                    </button>
                  </div>
                </div>
              ) : revealed ? (
                <div className={styles.ratings} role="group" aria-label="How did you do?">
                  {RECALL_RATINGS.map((r) => {
                    const suggested = check?.suggested === r.quality;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={styles.rating}
                        data-suggested={suggested || undefined}
                        aria-label={suggested ? `${r.label} (what your answer suggests)` : undefined}
                        onClick={() => rate(r.quality)}
                      >
                        {r.label}
                        <span className={styles.ratingKey} aria-hidden="true">
                          {suggested ? `${r.key} · suggested` : r.key}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Button variant="primary" size="lg" onClick={reveal}>
                  Show answer{" "}
                  <span className={styles.ratingKey} aria-hidden="true">
                    Space
                  </span>
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
      <SessionComposer
        placeholder="Type your answer before revealing…"
        inputLabel="Your answer"
        onSend={(typed) => save({ typed, revealed: true })}
        disabled={done || revealed}
        actions={[
          { label: "Skip step", onClick: () => rate(1), disabled: !revealed || done },
        ]}
      />
    </>
  );
}
