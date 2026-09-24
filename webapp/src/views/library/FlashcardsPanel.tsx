import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useAllDecks } from "../../hooks/useDecks";
import {
  useFlashcards,
  useFlashcardsDueCount,
} from "../../hooks/useFlashcards";
import { dueCardsFrom } from "../review/srs";
import { formatCreatedShort } from "./libraryMeta";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

export function FlashcardsPanel() {
  const { data: decks, isPending, isError, error } = useAllDecks();
  const { data: dueCount, isPending: dueCountPending } =
    useFlashcardsDueCount();
  /* Per-deck totals. A deck card used to say only when it was created, so
     the one question a student opens this tab with — which deck needs me
     today? — meant opening every deck in turn. Counted from the same
     all-cards list Today and readiness already load, so it costs no extra
     request once those have run. */
  const { data: allCards } = useFlashcards();
  const deckCounts = new Map<string, { total: number; due: number }>();
  if (allCards) {
    const dueIds = new Set(dueCardsFrom(allCards).map((c) => c.id));
    for (const card of allCards) {
      if (!card.deck_id) continue;
      const entry = deckCounts.get(card.deck_id) ?? { total: 0, due: 0 };
      entry.total += 1;
      if (dueIds.has(card.id)) entry.due += 1;
      deckCounts.set(card.deck_id, entry);
    }
  }
  const { removeDeck } = useLibraryActions();
  const { openCreateModal } = useCreateModal();

  const banner =
    !dueCountPending && dueCount && dueCount > 0 ? (
      <p className={styles.dueBanner}>
        <Icon name="layers" size={15} />
        <span>
          <strong>{dueCount}</strong> card{dueCount === 1 ? "" : "s"} due for
          review today.
        </span>
        {/* The banner counted the work and offered no way to start it. The
            daily drill already pulls due cards from every deck. */}
        <Link to="/review/daily-drill" className={styles.dueBannerAction}>
          Review due cards
        </Link>
      </p>
    ) : null;

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label="Loading your decks" height={180} />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={styles.loadError}>
        Could not load your flashcard decks. {(error as Error).message}
      </p>
    );
  }

  if (decks.length === 0) {
    return (
      <>
        {banner}
        <EmptyState
          icon="layers"
          title="No flashcards yet."
          message="Choose a material or topic and create a deck for review."
        >
          <Button
            variant="primary"
            onClick={() =>
              openCreateModal({
                type: "material",
                outputs: { flashcards: true, quiz: false },
                title: "Create flashcards",
              })
            }
          >
            Create flashcards
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {banner}
      <ul className={styles.grid}>
        {decks.map((deck) => {
          const counts = deckCounts.get(deck.id);
          return (
          <li key={deck.id} className={styles.card}>
            <Link to={`/review/${deck.id}`} className={styles.cardLink}>
              <h3 className={styles.cardTitle}>
                <Icon name="layers" size={18} />
                {deck.title}
              </h3>
              {counts ? (
                <p className={styles.cardMeta}>
                  {counts.total} card{counts.total === 1 ? "" : "s"}
                  {" · "}
                  {counts.due > 0 ? (
                    <strong className={styles.cardDue}>{counts.due} due</strong>
                  ) : (
                    "nothing due"
                  )}
                </p>
              ) : null}
              <p className={styles.cardMeta}>
                Created: {formatCreatedShort(deck.created_at)}
              </p>
              <span className={styles.cardCta}>
                {counts && counts.due === 0 && counts.total > 0
                  ? "Practise anyway"
                  : "Review"}
              </span>
            </Link>

            <div className={styles.cardActions}>
              <Link
                to={`/decks/${deck.id}`}
                className={styles.iconBtn}
                aria-label={`Edit cards in ${deck.title}`}
                title="Edit cards"
              >
                <Icon name="pencil" size={16} />
              </Link>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`Delete ${deck.title}`}
                title="Delete deck"
                onClick={() => void removeDeck(deck.id, deck.title)}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </>
  );
}
