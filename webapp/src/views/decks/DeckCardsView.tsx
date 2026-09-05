import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { flashcardsApi, type CardFields } from "../../api/flashcards";
import type { Flashcard } from "../../api/types";
import { Button } from "../../components/Button";
import { CardImage } from "../../components/CardImage";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import { useQuizDraft } from "../../hooks/useQuizDraft";
import { Storage } from "../../lib/storage";
import { cardDraftKey } from "../../lib/draftKeys";
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

/* One side's image control: pick, preview, replace, remove.
 *
 * The upload happens as soon as a file is chosen rather than on submit, so
 * the student sees the image they picked before committing the card. The
 * cost is an orphaned object if they then abandon the form — cheap, and far
 * better than a form that claims to have an image it has not stored. */
function ImageField({
  side,
  path,
  busy,
  onChange,
  onError,
}: {
  side: "front" | "back";
  path: string | null;
  busy: boolean;
  onChange: (path: string | null) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const label = side === "front" ? "Front image" : "Back image";

  return (
    <div className={styles.imageField}>
      {path ? (
        <div className={styles.imagePreview}>
          <CardImage
            path={path}
            alt={`${label} preview`}
            className={styles.previewImg}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || uploading}
            onClick={() => {
              /* The object is left in storage until the card is saved: the
                 student may still cancel, and removing it here would break
                 the card that is still referencing it on the server. */
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Remove image
          </Button>
        </div>
      ) : null}

      <label className={styles.imagePicker}>
        <span className={styles.imagePickerLabel}>
          {uploading
            ? "Uploading…"
            : path
              ? `Replace ${label.toLowerCase()}`
              : `Add ${label.toLowerCase()}`}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className={styles.fileInput}
          disabled={busy || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            flashcardsApi
              .uploadImage(file)
              .then(onChange)
              .catch((error: Error) => onError(error.message))
              .finally(() => setUploading(false));
          }}
        />
      </label>
    </div>
  );
}

interface CardDraft {
  front: string;
  back: string;
  frontImage: string | null;
  backImage: string | null;
}

/** Shared front/back editor, used both for adding a card and editing one. */
function CardForm({
  initialFront = "",
  initialBack = "",
  initialFrontImage = null,
  initialBackImage = null,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  onError,
  draftKey,
}: {
  initialFront?: string;
  initialBack?: string;
  initialFrontImage?: string | null;
  initialBackImage?: string | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (fields: CardFields) => void;
  onCancel?: () => void;
  onError: (message: string) => void;
  /* Set only when adding. A half-written *new* card is the one that had
     nowhere to live: closing the tab, a crash, or the app-wide error boundary
     firing lost whatever had been typed, and unlike the edit case there is no
     saved row to fall back to. An edit already has one, so restoring a stale
     draft over it would be the more surprising behaviour. */
  draftKey?: string;
}) {
  /* Read once, on mount: the caller decides whether a draft exists to restore,
     not the autosave hook (which deliberately never applies one itself). */
  const [restored] = useState<CardDraft | null>(() =>
    draftKey ? Storage.get<CardDraft>(draftKey) : null,
  );
  const [front, setFront] = useState(restored?.front ?? initialFront);
  const [back, setBack] = useState(restored?.back ?? initialBack);
  const [frontImage, setFrontImage] = useState<string | null>(
    restored?.frontImage ?? initialFrontImage,
  );
  const [backImage, setBackImage] = useState<string | null>(
    restored?.backImage ?? initialBackImage,
  );

  /* Each side needs *something* — text or an image. A card whose front is
     only a diagram ("what is this structure?") is a real card; one with an
     empty side is unreviewable, and saving it silently would drop a blank
     into the rotation. */
  const frontFilled = front.trim().length > 0 || frontImage !== null;
  const backFilled = back.trim().length > 0 || backImage !== null;
  const valid = frontFilled && backFilled;

  /* Worth persisting the moment either side has anything in it — a card is
     usually abandoned half-finished, which is exactly the state `valid`
     excludes. Gated so simply opening the form doesn't write an empty draft. */
  const worthKeeping = Boolean(draftKey) && (frontFilled || backFilled);
  const { clear: clearDraft } = useQuizDraft<CardDraft>(
    draftKey ?? "",
    { front, back, frontImage, backImage },
    { enabled: worthKeeping, warnOnUnload: worthKeeping },
  );

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        /* Cleared before the write, not after it succeeds: the fields are
           handed to onSubmit here, so a failed save keeps them on screen to
           retry from. Leaving the draft would restore this same card again on
           the next mount, after it had already been added. */
        clearDraft();
        onSubmit({
          front: front.trim(),
          back: back.trim(),
          frontImagePath: frontImage,
          backImagePath: backImage,
        });
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
        <ImageField
          side="front"
          path={frontImage}
          busy={busy}
          onChange={setFrontImage}
          onError={onError}
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
        <ImageField
          side="back"
          path={backImage}
          busy={busy}
          onChange={setBackImage}
          onError={onError}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            onClick={() => {
              clearDraft();
              onCancel();
            }}
            disabled={busy}
          >
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
          initialFrontImage={card.front_image_path ?? null}
          initialBackImage={card.back_image_path ?? null}
          submitLabel="Save card"
          busy={updateCard.isPending}
          onCancel={() => setEditing(false)}
          onError={(message) => showToast(message, { error: true })}
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
          <div className={styles.side}>
            <span className={styles.sideLabel}>Front</span>
            {card.front ? <p className={styles.sideText}>{card.front}</p> : null}
            <CardImage
              path={card.front_image_path}
              alt={`Front of card: ${card.front || "image"}`}
              className={styles.rowImg}
            />
          </div>
          <div className={`${styles.side} ${styles.back}`}>
            <span className={styles.sideLabel}>Back</span>
            {card.back ? <p className={styles.sideText}>{card.back}</p> : null}
            <CardImage
              path={card.back_image_path}
              alt={`Back of card: ${card.back || "image"}`}
              className={styles.rowImg}
            />
          </div>
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
            draftKey={cardDraftKey(deck.id)}
            submitLabel="Add card"
            busy={addCard.isPending}
            onCancel={() => setAdding(false)}
            onError={(message) => showToast(message, { error: true })}
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
