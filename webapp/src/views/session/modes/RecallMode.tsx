import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import type { Flashcard } from "../../../api/types";
import { useAllDecks } from "../../../hooks/useDecks";
import { useAllDueFlashcards, useUpdateFlashcardReview } from "../../../hooks/useFlashcards";
import { useToast } from "../../../context/toast";
import { nextReviewState } from "../../review/srs";
import { SessionComposer } from "../SessionComposer";
import { pickRecallCards, RECALL_RATINGS } from "./recall";
import type { ModeProps } from "../modeTypes";
import text from "../../../styles/text.module.css";
import styles from "../session.module.css";

const BLOCK = 6;

export interface RecallData {
  cardIds: string[];
  index: number;
  revealed: boolean;
  typed?: string;
}

export function RecallMode({ session, ctl, onSwitchMode }: ModeProps) {
  const dueQuery = useAllDueFlashcards(50);
  const decks = useAllDecks();
  const updateReview = useUpdateFlashcardReview();
  const { showToast } = useToast();
  const data = session.data.recall as RecallData | undefined;
  const [picked, setPicked] = useState<Flashcard[] | null>(null);

  const deckTitle = useCallback(
    (id: string | null) => decks.data?.find((d) => d.id === id)?.title ?? "Flashcards",
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
    (quality: number) => {
      if (!card || !revealed) return;
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
          recall: { ...(s.data.recall as RecallData), index: nextIndex, revealed: false, typed: undefined },
        },
      }));
    },
    [card, revealed, updateReview, showToast, index, ctl, cards.length],
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
      if (rating && revealed) rate(rating.quality);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal, rate, revealed]);

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
              message={`${cards.length} cards reviewed. Each one is rescheduled for when it would start to slip.`}
            />
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
                    <p className={styles.recallAnswer}>{card.back}</p>
                  </>
                ) : (
                  <p className={styles.caption}>Say it or type it before revealing.</p>
                )}
              </div>
              {revealed ? (
                <div className={styles.ratings} role="group" aria-label="How did you do?">
                  {RECALL_RATINGS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={styles.rating}
                      onClick={() => rate(r.quality)}
                    >
                      {r.label}
                      <span className={styles.ratingKey} aria-hidden="true">
                        {r.key}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Button variant="primary" size="lg" onClick={reveal}>
                  Show answer <span className={styles.ratingKey}>Space</span>
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
