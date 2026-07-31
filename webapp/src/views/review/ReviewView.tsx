import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Flashcard } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import {
  useFlashcardsByDeck,
  useUpdateFlashcardReview,
} from "../../hooks/useFlashcards";
import { dueCardsFrom, nextReviewState } from "./srs";
import styles from "./review.module.css";

/* Flashcard Review — ports `startReview` (js/router.js:640-792) and the
 * markup at index.html:1873-1909.
 *
 * Split the same way QuizRunner is: this component resolves the deck and its
 * due cards, `ReviewSession` runs the session once there's a real list to
 * hand it. Cards are snapshotted into the session at that point (`useState`'s
 * lazy initializer) rather than re-read from the live query on every render —
 * a background refetch after grading a card must not reshuffle the deck out
 * from under the card the student is currently looking at, the same reason
 * the vanilla's `cards` array was only ever fetched once per `startReview()`
 * call. */

export const FLASHCARDS_PATH = "/library/flashcards";

function ExitLink() {
  return (
    <Link to={FLASHCARDS_PATH} className={styles.exit}>
      ← Exit Review
    </Link>
  );
}

export function ReviewView() {
  const { deckId = "" } = useParams<{ deckId: string }>();
  const decks = useAllDecks();
  const cardsQuery = useFlashcardsByDeck(deckId);

  if (decks.isPending || cardsQuery.isPending) {
    return (
      <main className={styles.view} aria-busy="true">
        <Skeleton label="Loading flashcards" height={320} />
      </main>
    );
  }

  if (decks.isError || cardsQuery.isError) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load this deck.
        </p>
      </main>
    );
  }

  const deck = decks.data.find((d) => d.id === deckId);

  /* The vanilla never named the deck at all — `#review-deck-title` is
     static markup nothing ever assigned to (js/router.js has no reference to
     that id). Same class of bug Step 11 found for a folder's workspace
     title: the screen it names doesn't say what it's reviewing. */
  if (!deck) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <EmptyState
          icon="layers"
          title="This deck no longer exists."
          message="It may have been deleted from another tab or device."
        >
          <Link to={FLASHCARDS_PATH}>
            <Button variant="primary">Back to Flashcards</Button>
          </Link>
        </EmptyState>
      </main>
    );
  }

  const due = dueCardsFrom(cardsQuery.data);

  if (due.length === 0) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <h1 className={styles.title}>{deck.title}</h1>
        <EmptyState
          icon="check"
          title="All caught up! 🎉"
          message="No cards due for review in this deck right now."
        />
      </main>
    );
  }

  return <ReviewSession key={deckId} deckTitle={deck.title} cards={due} />;
}

const AI_GRADE_PROMPT = (card: Flashcard, answer: string) => `Grade my flashcard answer.
Front: ${card.front}
Correct Back: ${card.back}
My Answer: ${answer}

Based on how close I am, issue a <GRADE_FLASHCARD>X</GRADE_FLASHCARD> command where X is:
1 = Again (completely wrong)
2 = Hard (partially right)
3 = Good (mostly right)
4 = Easy (perfect)
Also provide a short 1-sentence feedback.`;

function ReviewSession({
  deckTitle,
  cards: initialCards,
}: {
  deckTitle: string;
  cards: Flashcard[];
}) {
  /* Grading invalidates `useFlashcardsByDeck`'s query (see
     useUpdateFlashcardReview), and that refetch's response is exactly the
     due list shrinking by the card just graded — the same background
     refetch the Library relies on elsewhere. Taking the prop only as
     `useState`'s initial value means it's read once, on mount, and never
     resynced: the session's own `index` stays valid against a `cards` array
     that can't change length out from under it mid-session. Without this,
     a refetch landing between two grades would shrink `cards` while `index`
     stayed put, which can make `index >= cards.length` true early and end
     the session before the student has actually seen every due card. */
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);

  const updateReview = useUpdateFlashcardReview();
  const { send, registerFlashcardGrader } = useChat();
  const { showToast } = useToast();

  const finished = index >= cards.length;

  /* Shared by the manual score buttons and the AI-grading tag: both are just
     "grade whichever card is showing right now". */
  const scoreCard = useCallback(
    (quality: number) => {
      const card = cards[index];
      if (!card) return;
      const { interval, ease, nextReviewDate } = nextReviewState(
        card,
        quality,
      );
      updateReview.mutate(
        { cardId: card.id, nextReviewDate, interval, ease },
        {
          onError: () =>
            showToast(
              "Couldn't save this card's review — it may come up again sooner than it should.",
              { error: true },
            ),
        },
      );
      setIndex((i) => i + 1);
      setFlipped(false);
      setAnswer("");
      setGrading(false);
    },
    [cards, index, updateReview, showToast],
  );

  /* The chat sits above the router and is the only thing that ever sees a
     `<GRADE_FLASHCARD>` tag (it comes back from `send()` below, or from the
     Turbo chat panel if the student asked it to grade something directly).
     Registering re-arms on every card change, the same way the vanilla's
     `bindScore` closures read `cards[currentIndex]` fresh on every click
     (js/router.js:777-789) rather than the card that was current when the
     button was first bound. */
  useEffect(() => {
    registerFlashcardGrader(scoreCard);
    return () => registerFlashcardGrader(null);
  }, [registerFlashcardGrader, scoreCard]);

  if (finished) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <h1 className={styles.title}>{deckTitle}</h1>
        <EmptyState
          icon="brain"
          title="Review Complete! 🧠"
          message="Great job."
        />
      </main>
    );
  }

  const card = cards[index];

  const handleAiGrade = async () => {
    const trimmed = answer.trim();
    if (!trimmed || grading) return;
    setGrading(true);
    /* Flips to reveal the correct answer while grading, same as the vanilla
       (js/router.js:721-724). */
    setFlipped(true);
    /* `send` never throws — a failed request lands in the chat as an error
       message instead (see ChatProvider.send's catch). If the reply never
       contains a valid tag (the model ignored the instruction, or the
       request failed), `grading` has no timeout and stays on until the
       student grades manually — the vanilla had the same gap: its own
       "AI is grading..." text was never replaced with real feedback either
       (js/router.js:718-719 sets it once and nothing ever updates it). */
    await send(AI_GRADE_PROMPT(card, trimmed));
  };

  return (
    <main className={styles.view}>
      <ExitLink />
      <div className={styles.header}>
        <h1 className={styles.title}>{deckTitle}</h1>
        <p className={styles.progress}>
          Card {index + 1} of {cards.length}
        </p>
      </div>

      <div className={styles.scene}>
        <button
          type="button"
          className={styles.card}
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          onClick={() => setFlipped(true)}
          aria-pressed={flipped}
          aria-label="Flip card to see the answer"
        >
          <div className={`${styles.face} ${styles.front}`}>
            <div className={styles.cardText}>{card.front}</div>
            {!flipped ? <p className={styles.hint}>Click to flip</p> : null}
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <div className={`${styles.cardText} ${styles.backText}`}>
              {card.back}
            </div>
          </div>
        </button>
      </div>

      {grading ? (
        <p className={styles.gradingStatus} role="status">
          <span className={styles.pulse} aria-hidden="true" /> AI is grading
          your answer...
        </p>
      ) : null}

      <div className={styles.aiRow}>
        <input
          type="text"
          className={styles.aiInput}
          placeholder="Type your answer for AI to grade..."
          aria-label="Your answer, for AI to grade"
          value={answer}
          disabled={grading}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAiGrade();
          }}
        />
        <Button
          onClick={() => void handleAiGrade()}
          disabled={grading || !answer.trim()}
        >
          Grade
        </Button>
      </div>

      {flipped ? (
        <div className={styles.controls}>
          <Button variant="danger" onClick={() => scoreCard(1)}>
            Again (1)
          </Button>
          <Button variant="warning" onClick={() => scoreCard(2)}>
            Hard (2)
          </Button>
          <Button variant="primary" onClick={() => scoreCard(3)}>
            Good (3)
          </Button>
          <Button variant="success" onClick={() => scoreCard(4)}>
            Easy (4)
          </Button>
        </div>
      ) : null}
    </main>
  );
}
