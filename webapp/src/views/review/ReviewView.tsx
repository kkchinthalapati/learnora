import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Skeleton } from "../../components/Skeleton";
import { useChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import {
  useFlashcardsByDeck,
  useUpdateFlashcardReview,
} from "../../hooks/useFlashcards";
import { renderMarkdownNodes } from "../../lib/markdownToReact";
import { isDue, REVIEW_SCORES, scheduleCard } from "../../lib/srs";
import type { Flashcard } from "../../api/types";
import { FlashcardScene } from "./FlashcardScene";
import { buildGradingPrompt } from "./gradingPrompt";
import styles from "./review.module.css";

/* Flashcard review — ports index.html:952-983 and js/router.js's
 * `startReview` (:640-790).
 *
 * The vanilla drove one set of DOM nodes imperatively and rebound every
 * listener on each entry by cloning the buttons ("to prevent listener
 * accumulation across repeated startReview() calls"). React remounts instead,
 * so the whole clone-and-replace dance disappears along with the class
 * toggling and the hand-written inline transforms. */

const FLASHCARDS_PATH = "/library/flashcards";

export function ReviewView() {
  const { deckId = "" } = useParams();
  /* Keyed so switching decks starts a genuinely new session rather than
     carrying the previous deck's index and snapshot across. */
  return <ReviewScreen key={deckId} deckId={deckId} />;
}

function ExitLink() {
  return (
    <Link to={FLASHCARDS_PATH} className={styles.exit}>
      ← Exit Review
    </Link>
  );
}

function ReviewScreen({ deckId }: { deckId: string }) {
  const {
    data: cards,
    isPending,
    isError,
    error,
  } = useFlashcardsByDeck(deckId);
  const { data: decks } = useAllDecks();
  const updateReview = useUpdateFlashcardReview();
  const { showToast } = useToast();
  const { registerFlashcardGrader } = useChat();

  /* The due set is snapshotted the first time the deck loads, and never
     recomputed. Two reasons, both bugs if it were derived on every render:
     scoring a card invalidates this query, so the list would change *under*
     the current index; and a card scored Again gets `interval = 0`, so it is
     due immediately and would silently re-enter the session it just left. The
     vanilla filtered once on entry for the same reason. */
  const [session, setSession] = useState<Flashcard[] | null>(null);
  useEffect(() => {
    if (session || !cards) return;
    setSession(cards.filter((c) => isDue(c.next_review_date)));
  }, [cards, session]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /* Set when the *model* scored the card rather than the student. See the
     note on `advance` below. */
  const [gradedByAi, setGradedByAi] = useState(false);

  const card = session && index < session.length ? session[index] : null;

  const advance = () => {
    setFlipped(false);
    setGradedByAi(false);
    setIndex((i) => i + 1);
  };

  /* `advance` is false only for an AI grade. The vanilla scored and moved on
     in the same breath, and `showCard()` then cleared `#ai-grading-feedback` —
     so the model's explanation was wiped in the same frame it arrived and the
     student never got to read it, which is the entire point of the feature.
     The card is still scheduled immediately; only the move to the next card
     waits for the student. */
  const score = (quality: number, moveOn = true) => {
    if (!card) return;
    const next = scheduleCard({
      interval: card.srs_interval,
      ease: card.ease_factor,
      quality,
    });
    updateReview.mutate(
      {
        cardId: card.id,
        nextReviewDate: next.nextReviewDate,
        interval: next.interval,
        ease: next.ease,
      },
      {
        /* The vanilla awaited the write before advancing, so a slow network
           froze the deck between cards. Advancing immediately keeps the review
           rhythm; a failure is surfaced rather than swallowed, because a lost
           write means the card's schedule silently didn't move. */
        onError: () =>
          showToast(
            "Couldn't save that card's schedule — it may come up again sooner than expected.",
            { error: true },
          ),
      },
    );
    if (moveOn) advance();
    else setGradedByAi(true);
  };

  /* Tell the chat where a `<GRADE_FLASHCARD>` tag should land while this
     screen is open, and take it back on unmount so the tag goes back to being
     ignored (which is what step 17 shipped, with no review screen to aim at).
     The callback is read through a ref so registering doesn't have to happen
     again every time the current card changes. */
  const scoreRef = useRef(score);
  scoreRef.current = score;
  useEffect(
    () =>
      registerFlashcardGrader((quality) => scoreRef.current(quality, false)),
    [registerFlashcardGrader],
  );

  if (isError) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load this deck. {(error as Error).message}
        </p>
      </main>
    );
  }

  if (isPending || !session) {
    return (
      <main className={styles.view} aria-busy="true">
        <Skeleton label="Loading cards" height={300} />
      </main>
    );
  }

  /* The vanilla's two end states, kept as their own screens rather than
     `innerHTML` swapped into the card's front face — the card is not a card
     any more at that point, and leaving it flippable was odd. */
  if (session.length === 0) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <div className={styles.endState}>
          <h1>All caught up! 🎉</h1>
          <p>No cards due for review in this deck right now.</p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className={styles.view}>
        <ExitLink />
        <div className={styles.endState}>
          <h1>Review Complete! 🧠</h1>
          <p>Great job.</p>
          <Link to={FLASHCARDS_PATH} className={styles.endCta}>
            Back to Flashcards
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.view}>
      <header className={styles.header}>
        <ExitLink />
        {/* The vanilla left `#review-deck-title` hard-coded to "Flashcard
            Review" and never filled it in, despite giving it an id. Naming the
            deck costs nothing — `useAllDecks` is already cached by the Library
            tab this screen is reached from. */}
        <h1>
          {decks?.find((d) => d.id === deckId)?.title || "Flashcard Review"}
        </h1>
        <p className={styles.progress}>
          Card {index + 1} of {session.length}
        </p>
      </header>

      <FlashcardScene
        front={card.front}
        back={card.back}
        flipped={flipped}
        onFlip={() => setFlipped(true)}
      />

      <AiGradePanel card={card} flip={() => setFlipped(true)} />

      {/* Scoring only appears once the answer has been seen — grading a card
          you haven't looked at isn't a review. Once the model has scored it
          there is nothing left to score, so the row becomes the one control
          that is still meaningful. */}
      {gradedByAi ? (
        <div className={styles.controls}>
          <button type="button" className={styles.nextBtn} onClick={advance}>
            Next card →
          </button>
        </div>
      ) : flipped ? (
        <div className={styles.controls}>
          {REVIEW_SCORES.map((s) => (
            <button
              key={s.quality}
              type="button"
              className={`${styles.score} ${styles[`score${s.label}`]}`}
              onClick={() => score(s.quality)}
            >
              {s.label} ({s.key})
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}

/* "Type your answer for AI to grade" — ports js/router.js:708-748.
 *
 * The grading round trip goes through the *chat*, exactly as the vanilla's
 * did: the prompt is sent with `AI.send`, the model replies with a
 * `<GRADE_FLASHCARD>N</GRADE_FLASHCARD>` tag, and the chat executes it against
 * the grader the screen registered. The panel is deliberately not opened — the
 * vanilla didn't either — so the reply is mirrored here, which is what
 * `#ai-grading-feedback` was for. */
function AiGradePanel({ card, flip }: { card: Flashcard; flip: () => void }) {
  const { send, messages } = useChat();
  const [answer, setAnswer] = useState("");
  const [gradingFrom, setGradingFrom] = useState<number | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  /* Cleared on every card — a previous card's feedback hanging over the next
     question is the one thing the vanilla explicitly reset in `showCard()`. */
  useEffect(() => {
    setAnswer("");
    setGradingFrom(null);
  }, [card.id]);

  const reply =
    gradingFrom === null
      ? null
      : (messages.slice(gradingFrom).find((m) => m.role === "ai") ?? null);

  return (
    <>
      {reply ? (
        <div className={styles.feedback} role="status">
          {/* Rendered, not printed: the vanilla wrote
              `renderMarkdown(display)` into `#ai-grading-feedback`, and the
              model does use bold for the term it is correcting — plain text
              would show the student literal `**asterisks**`. */}
          {reply.pending
            ? "AI is grading your answer…"
            : renderMarkdownNodes(reply.text)}
        </div>
      ) : null}

      <form
        className={styles.gradeRow}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = answer.trim();
          if (!trimmed) return;
          /* Flip first: the student has committed to an answer, so holding
             the back of the card back would only be suspense. */
          flip();
          setGradingFrom(messagesRef.current.length);
          void send(buildGradingPrompt(card, trimmed));
        }}
      >
        <input
          type="text"
          className={styles.gradeInput}
          value={answer}
          placeholder="Type your answer for AI to grade..."
          aria-label="Your answer, for AI grading"
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button type="submit" className={styles.gradeBtn}>
          Grade
        </button>
      </form>
    </>
  );
}
