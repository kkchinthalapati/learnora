import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { callEdge } from "../../api/ai";
import type { Flashcard } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useChat } from "../../context/chat";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import {
  useFlashcardsByDeck,
  useUpdateFlashcardReview,
} from "../../hooks/useFlashcards";
import { fenceUntrusted } from "../../lib/actionTags";
import { executeActions, type ActionHandlers } from "../../lib/chatActions";
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
      <div className={styles.view} aria-busy="true">
        <Skeleton label="Loading flashcards" height={320} />
      </div>
    );
  }

  if (decks.isError || cardsQuery.isError) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <p role="alert" className={styles.loadError}>
          Could not load this deck.
        </p>
      </div>
    );
  }

  const deck = decks.data.find((d) => d.id === deckId);

  /* The vanilla never named the deck at all — `#review-deck-title` is
     static markup nothing ever assigned to (js/router.js has no reference to
     that id). Same class of bug Step 11 found for a folder's workspace
     title: the screen it names doesn't say what it's reviewing. */
  if (!deck) {
    return (
      <div className={styles.view}>
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
      </div>
    );
  }

  const due = dueCardsFrom(cardsQuery.data);

  if (due.length === 0) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <h1 className={styles.title}>{deck.title}</h1>
        <EmptyState
          icon="check"
          title="All caught up! 🎉"
          message="No cards due for review in this deck right now."
        />
      </div>
    );
  }

  return <ReviewSession key={deckId} deckTitle={deck.title} cards={due} />;
}

/* Card text and the student's typed answer are fenced before entering the
 * prompt: both are model-generated-or-student-entered content the app is
 * about to interpolate into its own prompt, so a card carrying (say) an
 * `<ADD_TASK>…</ADD_TASK>` sequence in its `front`/`back` must not be able
 * to steer the reply. Same class of concern `lib/chatPrompt.ts` already
 * fences note bodies for. */
const AI_GRADE_PROMPT = (
  card: Flashcard,
  answer: string,
) => `Grade my flashcard answer.
Front: ${fenceUntrusted(card.front)}
Correct Back: ${fenceUntrusted(card.back)}
My Answer: ${fenceUntrusted(answer)}

Based on how close I am, issue a <GRADE_FLASHCARD>X</GRADE_FLASHCARD> command where X is:
1 = Again (completely wrong)
2 = Hard (partially right)
3 = Good (mostly right)
4 = Easy (perfect)
Also provide a short 1-sentence feedback.`;

/** `AI_GRADE_PROMPT` only ever asks for one tag, so `executeActions` only
 *  ever needs one real handler — the rest exist purely to satisfy
 *  `ActionHandlers`'s shape and are never reachable from this prompt. A
 *  fresh object per call is cheap and avoids memoising a dependency on
 *  `scoreCard`, which itself changes identity every card. */
function gradeOnlyHandlers(scoreCard: (score: number) => void): ActionHandlers {
  const unreachable = () => {
    throw new Error("AI_GRADE_PROMPT does not ask for this tag");
  };
  return {
    confirm: async () => false,
    addTask: unreachable,
    completeTask: unreachable,
    deleteTask: unreachable,
    rescheduleTask: unreachable,
    addExam: unreachable,
    deleteExam: unreachable,
    startTimer: () => {},
    setTheme: () => false,
    navigate: () => false,
    generateQuiz: () => {},
    generateDeck: () => {},
    generatePlan: () => {},
    gradeFlashcard: scoreCard,
  };
}

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
  /* Mirrors `grading`, but readable synchronously after an `await` without
     closing over a stale render — see `handleAiGrade` below, an improvement
     the vanilla never had: its own "AI is grading..." text had no recovery
     path if the reply never contained a usable tag. */
  const aiGradeInFlight = useRef(false);

  const updateReview = useUpdateFlashcardReview();
  const { registerFlashcardGrader } = useChat();
  const { settings } = useSettings();
  const { showToast } = useToast();

  const finished = index >= cards.length;

  /* Shared by the manual score buttons and the AI-grading tag: both are just
     "grade whichever card is showing right now". */
  const scoreCard = useCallback(
    (quality: number) => {
      const card = cards[index];
      if (!card) return;
      const { interval, ease, nextReviewDate } = nextReviewState(card, quality);
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
      aiGradeInFlight.current = false;
      setIndex((i) => i + 1);
      setFlipped(false);
      setAnswer("");
      setGrading(false);
    },
    [cards, index, updateReview, showToast],
  );

  /* Registered so a `<GRADE_FLASHCARD>` tag from the *floating* Turbo panel
     (a student who happens to chat "I knew that one" while reviewing) can
     still reach this session — see chatPrompt.ts's review-scoped teaching of
     that tag. The AI-grade box below this component does not go through the
     registered ref at all; it grades directly, for the reasons in
     `handleAiGrade`'s own comment. Registering re-arms on every card change,
     the same way the vanilla's `bindScore` closures read `cards[currentIndex]`
     fresh on every click (js/router.js:777-789) rather than the card that was
     current when the button was first bound. */
  useEffect(() => {
    registerFlashcardGrader(scoreCard);
    return () => registerFlashcardGrader(null);
  }, [registerFlashcardGrader, scoreCard]);

  if (finished) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <h1 className={styles.title}>{deckTitle}</h1>
        <EmptyState
          icon="brain"
          title="Review Complete! 🧠"
          message="Great job."
        />
      </div>
    );
  }

  const card = cards[index];

  const handleAiGrade = async () => {
    const trimmed = answer.trim();
    if (!trimmed || grading) return;
    aiGradeInFlight.current = true;
    setGrading(true);
    /* Flips to reveal the correct answer while grading, same as the vanilla
       (js/router.js:721-724). */
    setFlipped(true);
    try {
      /* A direct callEdge, not `useChat().send()`. The AI_GRADE_PROMPT below
         is a complete, self-contained request — it needs no pending tasks,
         no upcoming exams, no active-view text, and none of the dozen other
         tags the workspace chat's CAPABILITIES section teaches, none of
         which are relevant to grading one flashcard. Sending it through
         `send()` used to wrap it in the entire buildSystemContext anyway —
         more tokens, a slower reply, for a request that only ever needed one
         tag and one sentence back. Persona/conciseness/language voice is
         still applied: the edge function's own systemInstruction (built from
         `settings`, server-side) covers that regardless of what the client
         sends as history. */
      const { text } = await callEdge({
        history: [{ role: "user", content: AI_GRADE_PROMPT(card, trimmed) }],
        settings,
      });
      await executeActions(text, gradeOnlyHandlers(scoreCard));
    } catch {
      /* Falls through to the same "couldn't grade" recovery below as a reply
         with no usable tag — a transport failure and a model that ignored
         the instruction look the same to the student: nothing graded, try
         again. The vanilla had no recovery at all if the reply never
         contained a usable tag: its "AI is grading..." text was set once
         (js/router.js:718-719) and nothing ever replaced it. Checking the ref
         here — `scoreCard` clears it on success — means either failure mode
         surfaces as a real error instead of a screen stuck forever. */
    }
    if (aiGradeInFlight.current) {
      aiGradeInFlight.current = false;
      setGrading(false);
      showToast(
        "AI couldn't grade that answer — try again, or grade it yourself below.",
        { error: true },
      );
    }
  };

  return (
    <div className={styles.view}>
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
          {/* `backface-visibility: hidden` only hides whichever face is
              turned away *visually* — both stay in the accessibility tree
              regardless, so without aria-hidden a screen reader announces
              the answer immediately, before the student ever flips. */}
          <div
            className={`${styles.face} ${styles.front}`}
            aria-hidden={flipped}
          >
            <div className={styles.cardText}>{card.front}</div>
            {!flipped ? <p className={styles.hint}>Click to flip</p> : null}
          </div>
          <div
            className={`${styles.face} ${styles.back}`}
            aria-hidden={!flipped}
          >
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
          {/* Disabled while an AI grade is in flight: grading manually here
              would advance to the next card and re-arm the registered
              grader for it, so a late AI reply for *this* card would score
              whichever card is showing by the time it arrives instead. */}
          <Button
            variant="danger"
            onClick={() => scoreCard(1)}
            disabled={grading}
          >
            Again (1)
          </Button>
          <Button
            variant="warning"
            onClick={() => scoreCard(2)}
            disabled={grading}
          >
            Hard (2)
          </Button>
          <Button
            variant="primary"
            onClick={() => scoreCard(3)}
            disabled={grading}
          >
            Good (3)
          </Button>
          <Button
            variant="success"
            onClick={() => scoreCard(4)}
            disabled={grading}
          >
            Easy (4)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
