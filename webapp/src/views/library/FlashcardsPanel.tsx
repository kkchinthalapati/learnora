import { Link } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useCreateModal } from "../../context/createModal";
import { useAllDecks } from "../../hooks/useDecks";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { formatCreatedShort } from "./libraryMeta";
import { useLibraryActions } from "./useLibraryActions";
import styles from "./library.module.css";

/* The Library's Flashcards tab — ports js/router.js:300-328 plus the due
 * banner js/main.js:2282-2291 wrote into `#flashcards-due-banner`.
 *
 * The banner is rendered from the same `useFlashcardsDueCount()` query the
 * dashboard badge will read (ledger step 12) instead of being pushed into the
 * DOM by whichever screen happened to refresh the count last. */
export function FlashcardsPanel() {
  const { data: decks, isPending, isError, error } = useAllDecks();
  const { data: dueCount = 0 } = useFlashcardsDueCount();
  const { removeDeck } = useLibraryActions();
  const { openCreateModal } = useCreateModal();

  const banner =
    dueCount > 0 ? (
      <p className={styles.dueBanner}>
        <Icon name="layers" size={15} />
        <span>
          <strong>{dueCount}</strong> card{dueCount === 1 ? "" : "s"} due for
          review today.
        </span>
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
          message="Generate flashcards from your study materials using Learnora AI."
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
            Create flashcards →
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {banner}
      <ul className={styles.grid}>
        {decks.map((deck) => (
          <li key={deck.id} className={styles.card}>
            <Link to={`/review/${deck.id}`} className={styles.cardLink}>
              <h3 className={styles.cardTitle}>
                <Icon name="layers" size={18} />
                {deck.title}
              </h3>
              <p className={styles.cardMeta}>
                Created: {formatCreatedShort(deck.created_at)}
              </p>
              <span className={styles.cardCta}>Review</span>
            </Link>

            <div className={styles.cardActions}>
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
        ))}
      </ul>
    </>
  );
}
