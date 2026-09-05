import { useState } from "react";
import { Link, useParams } from "react-router";
import type { Flashcard } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import {
  useAddFlashcard,
  useDeleteFlashcard,
  useFlashcardsByDeck,
  useUpdateFlashcard,
} from "../../hooks/useFlashcards";
import styles from "./deck.module.css";

/* Deck contents — the screen a deck never had.
 *
 * Until now a deck could only be reviewed. Cards arrived in AI-generated
 * batches and there was no way to see the whole deck, fix a card the model
 * got wrong, drop a duplicate, or add one of your own; the only editing
 * gesture in the app was "delete the entire deck", which is not an edit. */

export const FLASHCARDS_PATH = "/library/flashcards";

function BackLink() {
  return (
    <Link to={FLASHCARDS_PATH} className={styles.exit}>
      ← Back to Flashcards
    </Link>
  );
}

/** Shared front/back editor, used both for adding a card and editing one. */
function CardForm({
  initialFront = "",
  initialBack = "",
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initialFront?: string;
  initialBack?: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (fields: { front: string; back: string }) => void;
  onCancel?: () => void;
}) {
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);

  /* Both sides are required: a card with an empty side is unreviewable, and
     saving one silently would put a blank card into the rotation. */
  const valid = front.trim().length > 0 && back.trim().length > 0;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        onSubmit({ front: front.trim(), back: back.trim() });
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="card-front">
          Front
        </label>
        <textarea
          id="card-front"
          className={styles.input}
          rows={2}
          value={front}
          onChange={(event) => setFront(event.target.value)}
          placeholder="The question or prompt"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="card-back">
          Back
        </label>
        <textarea
          id="card-back"
          className={styles.input}
          rows={3}
          value={back}
          onChange={(event) => setBack(event.target.value)}
          placeholder="The answer"
        />
      </div>

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function scheduleLabel(card: Flashcard): string {
  if (!card.next_review_date) return "New — not reviewed yet";
  const due = new Date(card.next_review_date);
  if (Number.isNaN(due.getTime())) return "New — not reviewed yet";
  if (due <= new Date()) return "Due now";
  return `Next review ${due.toLocaleDateString()}`;
}

function CardRow({
  card,
  deckId,
}: {
  card: Flashcard;
  deckId: string;
}) {
  const [editing, setEditing] = useState(false);
  const { confirm } = useDialog();
  const { showToast } = useToast();
  const updateCard = useUpdateFlashcard();
  const deleteCard = useDeleteFlashcard();

  if (editing) {
    return (
      <li className={styles.card}>
        <CardForm
          initialFront={card.front}
          initialBack={card.back}
          submitLabel="Save card"
          busy={updateCard.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(fields) =>
            updateCard.mutate(
              { cardId: card.id, deckId, fields },
              {
                onSuccess: () => {
                  setEditing(false);
                  showToast("Card updated.");
                },
                onError: () =>
                  showToast("Couldn't save that card. Please try again.", {
                    error: true,
                  }),
              },
            )
          }
        />
      </li>
    );
  }

  return (
    <li className={styles.card}>
      <div className={styles.cardRow}>
        <div className={styles.cardText}>
          <p className={styles.side}>
            <span className={styles.sideLabel}>Front</span>
            {card.front}
          </p>
          <p className={`${styles.side} ${styles.back}`}>
            <span className={styles.sideLabel}>Back</span>
            {card.back}
          </p>
          <p className={styles.schedule}>{scheduleLabel(card)}</p>
        </div>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Edit card: ${card.front}`}
            title="Edit card"
            onClick={() => setEditing(true)}
          >
            <Icon name="pencil" size={16} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Delete card: ${card.front}`}
            title="Delete card"
            disabled={deleteCard.isPending}
            onClick={() => {
              void (async () => {
                const ok = await confirm(
                  "This card and its review history will be permanently deleted. The rest of the deck is untouched.",
                  {
                    title: "Delete card?",
                    confirmText: "Delete",
                    danger: true,
                  },
                );
                if (!ok) return;
                deleteCard.mutate(
                  { cardId: card.id, deckId },
                  {
                    onSuccess: () => showToast("Card deleted."),
                    onError: () =>
                      showToast(
                        "Couldn't delete that card. Please try again.",
                        { error: true },
                      ),
                  },
                );
              })();
            }}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

export function DeckCardsView() {
  const { deckId = "" } = useParams<{ deckId: string }>();
  const decks = useAllDecks();
  const cards = useFlashcardsByDeck(deckId);
  const addCard = useAddFlashcard();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);

  if (decks.isPending || cards.isPending) {
    return (
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading deck" height={320} />
      </div>
    );
  }

  if (decks.isError || cards.isError) {
    return (
      <div className={styles.view}>
        <BackLink />
        <p role="alert" className={styles.loadError}>
          Could not load this deck.
        </p>
      </div>
    );
  }

  const deck = decks.data.find((d) => d.id === deckId);

  if (!deck) {
    return (
      <div className={styles.view}>
        <BackLink />
        <EmptyState
          icon="layers"
          title="This deck no longer exists."
          message="It may have been deleted from another tab or device."
        >
          <Link to={FLASHCARDS_PATH}>
            <Button variant="primary">Back to Flashcards</Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  const list = cards.data;

  return (
    <div className={styles.view}>
      <BackLink />
      <PageHeader
        title={deck.title}
        eyebrow="Deck"
        sub={
          <span className={styles.count}>
            {list.length} {list.length === 1 ? "card" : "cards"}
          </span>
        }
        actions={
          list.length > 0 ? (
            <Link to={`/review/${deck.id}`}>
              <Button variant="primary">Review</Button>
            </Link>
          ) : null
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon="layers"
          title="This deck is empty."
          message="Add a card below to start building it."
        />
      ) : (
        <ul className={styles.list}>
          {list.map((card) => (
            <CardRow key={card.id} card={card} deckId={deck.id} />
          ))}
        </ul>
      )}

      <div className={styles.addPanel}>
        <h2 className={styles.addPanelTitle}>Add a card</h2>
        {adding ? (
          <CardForm
            submitLabel="Add card"
            busy={addCard.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(card) =>
              addCard.mutate(
                { deckId: deck.id, card },
                {
                  onSuccess: () => {
                    setAdding(false);
                    showToast("Card added.");
                  },
                  onError: () =>
                    showToast("Couldn't add that card. Please try again.", {
                      error: true,
                    }),
                },
              )
            }
          />
        ) : (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Write a card
          </Button>
        )}
      </div>
    </div>
  );
}
