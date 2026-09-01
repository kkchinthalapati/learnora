import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { callEdge } from "../../api/ai";
import type { Flashcard } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useChat } from "../../context/chat";
import { useSettings } from "../../context/settings";
import { useOptionalTimer } from "../../context/timer";
import { useToast } from "../../context/toast";
import { useAllDecks } from "../../hooks/useDecks";
import { useContinuity } from "../../hooks/useContinuity";
import { useAddTask } from "../../hooks/useTasks";
import {
  useFlashcardsByDeck,
  useAllDueFlashcards,
  useUpdateFlashcardReview,
} from "../../hooks/useFlashcards";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { dateInDays } from "../../lib/date";
import { fenceUntrusted } from "../../lib/actionTags";
import { executeActions, type ActionHandlers } from "../../lib/chatActions";
import { renderMarkdownNodes } from "../../lib/markdownToReact";
import {
  availableReviewLengths,
  createReviewSnapshot,
  defaultReviewLength,
  recapFrom,
  type ReviewLength,
  type ReviewOrder,
  type ReviewResult,
} from "./session";
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
  const isDailyDrill = deckId === "daily-drill";

  const decks = useAllDecks();
  const deckCardsQuery = useFlashcardsByDeck(deckId);
  const allDueCardsQuery = useAllDueFlashcards(20);

  const cardsQuery = isDailyDrill ? allDueCardsQuery : deckCardsQuery;

  /* Grading the last due card triggers a background refetch that recomputes
     `due` to []. Without this, the `due.length === 0` guard below would
     unmount ReviewLauncher — and with it the just-earned Session Recap —
     the instant that refetch lands, replacing the recap the student hasn't
     even seen yet with the plain "All caught up" empty state. A ref (not
     state) is enough: it only needs to be true by the time this component
     re-renders from the refetch, and ReviewLauncher sets it synchronously,
     well before that. */
  const sessionActiveRef = useRef(false);

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

  const deck = isDailyDrill
    ? { title: "Daily 5-Minute Drill", folder_id: null as string | null }
    : decks.data.find((d) => d.id === deckId);

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

  const due = isDailyDrill
    ? cardsQuery.data || []
    : dueCardsFrom(cardsQuery.data);

  if (due.length === 0 && !sessionActiveRef.current) {
    return (
      <div className={styles.view}>
        <ExitLink />
        <h2 className={styles.title}>{deck.title}</h2>
        <EmptyState
          icon="check"
          title="All caught up! 🎉"
          message={
            isDailyDrill
              ? "No cards due across any deck. Take a break!"
              : "No cards due for review in this deck right now."
          }
        />
      </div>
    );
  }

  return (
    <ReviewLauncher
      key={deckId}
      deckId={deckId}
      deckTitle={deck.title}
      folderId={deck.folder_id ?? null}
      dueCards={due}
      onSessionStart={() => {
        sessionActiveRef.current = true;
      }}
    />
  );
}

function ReviewLauncher({
  deckId,
  deckTitle,
  folderId,
  dueCards,
  onSessionStart,
}: {
  deckId: string;
  deckTitle: string;
  folderId?: string | null;
  dueCards: Flashcard[];
  onSessionStart: () => void;
}) {
  const [sessionCards, setSessionCards] = useState<Flashcard[] | null>(null);

  if (sessionCards) {
    return (
      <ReviewSession
        deckId={deckId}
        deckTitle={deckTitle}
        folderId={folderId}
        cards={sessionCards}
      />
    );
  }

  return (
    <ReviewSetup
      deckTitle={deckTitle}
      dueCards={dueCards}
      onStart={(length, order) => {
        onSessionStart();
        setSessionCards(createReviewSnapshot(dueCards, length, order));
      }}
    />
  );
}

function ReviewSetup({
  deckTitle,
  dueCards,
  onStart,
}: {
  deckTitle: string;
  dueCards: Flashcard[];
  onStart: (length: ReviewLength, order: ReviewOrder) => void;
}) {
  const [length, setLength] = useState<ReviewLength>(() =>
    defaultReviewLength(dueCards.length),
  );
  const [order, setOrder] = useState<ReviewOrder>("due");
  const lengths = availableReviewLengths(dueCards.length);

  return (
    <div className={styles.view}>
      <ExitLink />
      <div className={styles.setup}>
        <p className={styles.eyebrow}>Ready to review</p>
        <h2 className={styles.title}>{deckTitle}</h2>
        <p className={styles.setupIntro}>
          {dueCards.length} {dueCards.length === 1 ? "card is" : "cards are"}{" "}
          due. Choose a focused session that fits the time you have.
        </p>

        <fieldset className={styles.optionGroup}>
          <legend>Session length</legend>
          <div className={styles.choiceGrid}>
            {lengths.map((option) => {
              const label =
                option === "all" ? `All (${dueCards.length})` : String(option);
              return (
                <label className={styles.choice} key={String(option)}>
                  <input
                    type="radio"
                    name="review-length"
                    value={String(option)}
                    checked={length === option}
                    onChange={() => setLength(option)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className={styles.optionGroup}>
          <legend>Card order</legend>
          <div className={styles.orderChoices}>
            <label className={styles.orderChoice}>
              <input
                type="radio"
                name="review-order"
                value="due"
                checked={order === "due"}
                onChange={() => setOrder("due")}
              />
              <span>
                <strong>Due order</strong>
                <small>Oldest due cards first</small>
              </span>
            </label>
            <label className={styles.orderChoice}>
              <input
                type="radio"
                name="review-order"
                value="difficult"
                checked={order === "difficult"}
                onChange={() => setOrder("difficult")}
              />
              <span>
                <strong>Difficult first</strong>
                <small>Lower-ease cards get priority</small>
              </span>
            </label>
          </div>
        </fieldset>

        <Button variant="primary" onClick={() => onStart(length, order)}>
          Start review
        </Button>
      </div>
    </div>
  );
}

export interface SourceNoteContext {
  materialId: string;
  quote?: string;
  title?: string;
}

export function extractSourceNoteContext(
  card: Flashcard,
): SourceNoteContext | null {
  if (!card) return null;
  const c = card as any;

  // 1. Direct properties on card
  const directId = c.source_material_id || c.material_id;
  if (directId) {
    return {
      materialId: String(directId),
      quote:
        c.source_quote ||
        (typeof c.notes === "string" && !c.notes.startsWith("{")
          ? c.notes
          : undefined),
      title: c.source_material_title || c.material_title || undefined,
    };
  }

  // 2. Structured JSON or plain note reference in notes
  if (typeof c.notes === "string" && c.notes.trim()) {
    try {
      const parsed = JSON.parse(c.notes);
      if (parsed && (parsed.materialId || parsed.material_id)) {
        return {
          materialId: String(parsed.materialId || parsed.material_id),
          quote: parsed.quote || parsed.source_quote,
          title: parsed.title || parsed.materialTitle || parsed.material_title,
        };
      }
    } catch {
      const match = c.notes.match(/\/notes\/([a-zA-Z0-9_-]+)/);
      if (match) {
        return {
          materialId: match[1],
          quote:
            c.notes.replace(/\/notes\/[a-zA-Z0-9_-]+/, "").trim() || undefined,
        };
      }
    }
  }

  // 3. Embedded comment <!-- source_context: {...} --> in back or front
  const combined = `${card.back || ""} ${card.front || ""}`;
  const commentMatch = combined.match(
    /<!--\s*source(?:_context)?:\s*(\{[\s\S]*?\})\s*-->/i,
  );
  if (commentMatch) {
    try {
      const parsed = JSON.parse(commentMatch[1]);
      if (parsed && (parsed.materialId || parsed.material_id)) {
        return {
          materialId: String(parsed.materialId || parsed.material_id),
          quote: parsed.quote || parsed.source_quote,
          title: parsed.title || parsed.materialTitle || parsed.material_title,
        };
      }
    } catch {
      // ignore
    }
  }

  // 4. Markdown links [Source Note](/notes/:id)
  const linkMatch = combined.match(/\[([^\]]*)\]\(\/notes\/([a-zA-Z0-9_-]+)\)/i);
  if (linkMatch) {
    const rawTitle = linkMatch[1].trim();
    return {
      materialId: linkMatch[2],
      title:
        rawTitle &&
        !["source", "note", "source note"].includes(rawTitle.toLowerCase())
          ? rawTitle
          : undefined,
    };
  }

  // 5. Bare path /notes/:id
  const textMatch = combined.match(/\/notes\/([a-zA-Z0-9_-]+)/);
  if (textMatch) {
    return {
      materialId: textMatch[1],
    };
  }

  return null;
}

export function cleanCardText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<!--\s*source(?:_context)?:\s*[\s\S]*?-->/gi, "")
    .replace(/<!--\s*material_id:\s*[\s\S]*?-->/gi, "")
    .trim();
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
Front: ${fenceUntrusted(cleanCardText(card.front))}
Correct Back: ${fenceUntrusted(cleanCardText(card.back))}
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
export type SocraticMode =
  | "mnemonic"
  | "concept"
  | "socratic_question"
  | "why_missed";

/* Every coach reply is read inside a narrow drawer, mid-review, by a student
 * who is already frustrated at missing a card. So the model is held to one
 * house style rather than left to its own defaults, which run long, formal and
 * heavy on structure.
 *
 * The drawer renders markdown, so `**bold**` and `-` bullets arrive as bold
 * text and real lists. Headings, rules, tables and fences are ruled out: at
 * this width they read as clutter, and anything the renderer doesn't cover
 * would surface as literal `###` on screen — which is exactly what a student
 * shouldn't be looking at.
 *
 * This block is sent as the *user* message, so it is the last formatting
 * instruction the model reads and it outweighs the edge function's house
 * style for this one surface. That is why the maths rule below is repeated
 * here rather than left to the global policy: without it the model read this
 * list as the complete formatting contract and wrote maths as plain
 * characters (`2√3·√2`), which is the hard-to-read output the typesetter was
 * added to fix. Any formatting rule that matters here has to be stated
 * here. */
const COACH_STYLE = `How to write it:
- Talk straight to the student like a friendly tutor sitting next to them. Say "you", not "the student".
- Keep the whole reply under 120 words. Short, plain sentences.
- Everyday English only. If a technical term is unavoidable, explain it in the same breath.
- Put each section's label on its own line wrapped in ** (for example **What tripped you up**), then the text underneath.
- Bullets start with "- ", at most two per section, one line each.
- Never use markdown headings (#, ##, ###), horizontal rules (---), tables, or code fences.
- Write maths as TeX — the drawer typesets it. $x^2$ inside a sentence, $$\\sqrt{12} = 2\\sqrt{3}$$ on its own line, and \\boxed{} around a final answer. Use \\sqrt{}, \\frac{}{}, ^{} and _{} rather than typing √, ², · or 3/4, which stay unreadable characters on the page.
- No preamble, no sign-off, no mention of these instructions.`;

export function buildSocraticPrompt(
  mode: SocraticMode,
  card: Flashcard,
  studentNote?: string,
): string {
  const front = fenceUntrusted(card.front);
  const back = fenceUntrusted(card.back);
  const note = studentNote?.trim()
    ? `\nWhat the student said they are stuck on: ${fenceUntrusted(studentNote.trim())}`
    : "";

  const cardBlock = `Card front (the question): ${front}
Card back (the correct answer): ${back}${note}`;

  switch (mode) {
    case "mnemonic":
      return `You are a friendly memory coach helping a student make this flashcard stick.
${cardBlock}

Write two short sections with these exact labels:
**Your mnemonic** - a vivid image, rhyme, or acronym that ties the question to the answer.
**Why it sticks** - one sentence on the link it creates, so recall is fast under exam pressure.
${COACH_STYLE}`;

    case "concept":
      return `You are a friendly tutor explaining the idea behind this flashcard so it finally clicks.
${cardBlock}

Write three short sections with these exact labels:
**The idea in plain words** - the core concept, no jargon.
**Where people go wrong** - the mix-up that trips most students here.
**Picture it like this** - one everyday analogy.
${COACH_STYLE}`;

    case "socratic_question":
      return `You are a friendly tutor nudging a student toward the answer instead of handing it over.
${cardBlock}

Ask two or three short questions, in order, each one a small step closer to the answer. Number them 1., 2., 3. Never state the answer outright.
${COACH_STYLE}`;

    case "why_missed":
    default:
      return `You are a friendly study coach. The student just got this flashcard wrong and wants to know why.
${cardBlock}

Write three short sections with these exact labels:
**What tripped you up** - the one reason this card is easy to miss.
**What to look for** - the single clue on the front that points to the right answer.
**Remember it like this** - one short rule the student can tell themselves next time.
${COACH_STYLE}`;
  }
}

export function SocraticCoachDrawer({
  card,
  isOpen,
  onClose,
  initialMode = "why_missed",
}: {
  card: Flashcard | null;
  isOpen: boolean;
  onClose: () => void;
  initialMode?: SocraticMode;
}) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [mode, setMode] = useState<SocraticMode>(initialMode);
  const [customNote, setCustomNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setCustomNote("");
      setResponse(null);
      setError(null);
      setCopied(false);
    }
  }, [isOpen, initialMode, card?.id]);

  const requestCoach = useCallback(
    async (selectedMode: SocraticMode, noteText?: string) => {
      if (!card) return;
      setLoading(true);
      setError(null);
      try {
        const prompt = buildSocraticPrompt(selectedMode, card, noteText);
        const { text } = await callEdge({
          history: [{ role: "user", content: prompt }],
          settings,
        });
        setResponse(text.trim());
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not reach Socratic Coach. Please try again.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [card, settings],
  );

  useEffect(() => {
    if (isOpen && card && !response && !loading && !error) {
      void requestCoach(mode);
    }
  }, [isOpen, card, response, loading, error, mode, requestCoach]);

  const handleModeChange = (newMode: SocraticMode) => {
    setMode(newMode);
    setResponse(null);
    setError(null);
    void requestCoach(newMode, customNote);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNote.trim()) return;
    void requestCoach(mode, customNote);
  };

  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      showToast("Copied Socratic guidance to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy to clipboard", { error: true });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !card) return null;

  return (
    <div
      className={styles.socraticDrawerOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Socratic Coach"
    >
      <div
        className={styles.socraticDrawer}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.socraticHeader}>
          <div className={styles.socraticHeaderLeft}>
            <Icon name="brain" size={20} />
            <h2 className={styles.socraticTitle}>Socratic Coach &amp; Interceptor</h2>
          </div>
          <button
            type="button"
            className={styles.socraticCloseBtn}
            onClick={onClose}
            aria-label="Close Socratic Coach"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className={styles.socraticBody}>
          <div className={styles.socraticCardContext}>
            <div>
              <span className={styles.socraticContextLabel}>Q:</span>
              <span>{card.front}</span>
            </div>
            <div>
              <span className={styles.socraticContextLabel}>A:</span>
              <span>{card.back}</span>
            </div>
          </div>

          <div className={styles.socraticModeTabs} role="tablist" aria-label="Coaching modes">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "why_missed"}
              className={`${styles.socraticModeTab} ${
                mode === "why_missed" ? styles.socraticModeTabActive : ""
              }`}
              onClick={() => handleModeChange("why_missed")}
            >
              🎯 Why Did I Miss This?
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "mnemonic"}
              className={`${styles.socraticModeTab} ${
                mode === "mnemonic" ? styles.socraticModeTabActive : ""
              }`}
              onClick={() => handleModeChange("mnemonic")}
            >
              💡 Mnemonic Aid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "concept"}
              className={`${styles.socraticModeTab} ${
                mode === "concept" ? styles.socraticModeTabActive : ""
              }`}
              onClick={() => handleModeChange("concept")}
            >
              🔍 Concept Breakdown
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "socratic_question"}
              className={`${styles.socraticModeTab} ${
                mode === "socratic_question" ? styles.socraticModeTabActive : ""
              }`}
              onClick={() => handleModeChange("socratic_question")}
            >
              ❓ Socratic Questions
            </button>
          </div>

          <div className={styles.socraticResponseArea}>
            {loading ? (
              <div className={styles.socraticLoading} role="status">
                <span className={styles.pulse} aria-hidden="true" />
                <span>Socratic Coach is analyzing this concept...</span>
              </div>
            ) : error ? (
              <div className={styles.loadError}>
                <p>{error}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void requestCoach(mode, customNote)}
                >
                  Retry
                </Button>
              </div>
            ) : response ? (
              <>
                <div className={styles.socraticResponseHeader}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.socraticCopyBtn}
                    onClick={() => void handleCopy()}
                    aria-label="Copy guidance"
                  >
                    <Icon name={copied ? "check" : "file-text"} size={14} />
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                {/* The reply is markdown. Rendering it means the student reads
                    bold text and section leads rather than the `**` and `###`
                    the model typed. */}
                <div
                  className={styles.socraticScroll}
                  tabIndex={0}
                  role="region"
                  aria-label="Coach guidance"
                >
                  <div className={styles.socraticText}>
                    {renderMarkdownNodes(response)}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <form
            onSubmit={handleCustomSubmit}
            className={styles.socraticCustomInputRow}
          >
            <input
              type="text"
              className={styles.socraticCustomInput}
              placeholder="Ask a question or describe what confused you..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              disabled={loading}
              aria-label="Custom question for Socratic Coach"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              onClick={handleCustomSubmit}
              disabled={loading || !customNote.trim()}
            >
              Ask
            </Button>
          </form>
        </div>

        <div className={styles.socraticFooter}>
          <Button variant="secondary" onClick={onClose}>
            Resume Review
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  deckId,
  deckTitle,
  folderId,
  cards: initialCards,
}: {
  deckId: string;
  deckTitle: string;
  folderId?: string | null;
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
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [practiceRound, setPracticeRound] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [socraticOpen, setSocraticOpen] = useState(false);
  const [socraticMode, setSocraticMode] = useState<SocraticMode>("why_missed");
  const mountedRef = useRef(true);

  const openSocratic = (mode: SocraticMode = "why_missed") => {
    setSocraticMode(mode);
    setSocraticOpen(true);
  };
  /* Mirrors `grading`, but readable synchronously after an `await` without
     closing over a stale render — see `handleAiGrade` below, an improvement
     the vanilla never had: its own "AI is grading..." text had no recovery
     path if the reply never contained a usable tag. */
  const aiGradeInFlight = useRef(false);

  const updateReview = useUpdateFlashcardReview();
  const { registerFlashcardGrader } = useChat();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { recordDeck } = useContinuity();

  const finished = index >= cards.length;

  /* Feed the dashboard's "Resume Learning" card: the deck currently being
   * reviewed, with the card position, becomes the pick-up-where-you-left-off
   * candidate until another activity replaces it. */
  useEffect(() => {
    if (finished) return;
    if (!cards[index]) return;
    recordDeck({
      id: deckId,
      title: deckTitle,
      cardIndex: index,
      totalCards: cards.length,
    });
  }, [deckId, deckTitle, index, cards, finished, recordDeck]);

  /* Shared by the manual score buttons and the AI-grading tag: both are just
     "grade whichever card is showing right now". */
  const scoreCard = useCallback(
    (quality: number) => {
      const card = cards[index];
      if (!card) return;
      if (!practiceRound) {
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
        setResults((current) => [...current, { card, quality }]);
      }
      aiGradeInFlight.current = false;
      setIndex((i) => i + 1);
      setFlipped(false);
      setAnswer("");
      setGrading(false);
      setSourceDrawerOpen(false);
    },
    [cards, index, practiceRound, updateReview, showToast],
  );

  /* Keyboard shortcuts: Space to flip, 1-4 to grade (only when flipped and
     not grading) */
  useKeyboardShortcuts(
    {
      " ": () => !flipped && setFlipped(true),
      "1": () => flipped && !grading && scoreCard(1),
      "2": () => flipped && !grading && scoreCard(2),
      "3": () => flipped && !grading && scoreCard(3),
      "4": () => flipped && !grading && scoreCard(4),
    },
    { enabled: !finished },
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
    if (finished) {
      registerFlashcardGrader(null);
      return;
    }
    registerFlashcardGrader(scoreCard);
    return () => registerFlashcardGrader(null);
  }, [finished, registerFlashcardGrader, scoreCard]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      aiGradeInFlight.current = false;
    };
  }, []);

  if (finished) {
    const difficultCards = results
      .filter(({ quality }) => quality < 3)
      .map(({ card }) => card);

    return (
      <ReviewRecap
        deckId={deckId}
        deckTitle={deckTitle}
        folderId={folderId}
        results={results}
        practiceComplete={practiceRound}
        onRepeatDifficult={
          difficultCards.length && !practiceRound
            ? () => {
                setCards(difficultCards);
                setIndex(0);
                setPracticeRound(true);
                setFlipped(false);
                setAnswer("");
                setGrading(false);
                setSourceDrawerOpen(false);
              }
            : undefined
        }
      />
    );
  }

  const card = cards[index];
  const sourceContext = card ? extractSourceNoteContext(card) : null;

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
      /* Leaving the route does not cancel fetch, so a late reply must not
         grade a card or write SRS state after this session is gone. */
      if (!mountedRef.current) return;
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
    if (mountedRef.current && aiGradeInFlight.current) {
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
        <h2 className={styles.title}>{deckTitle}</h2>
        <p className={styles.progress}>
          Card {index + 1} of {cards.length}
        </p>
        {practiceRound ? (
          <p className={styles.practiceNotice} role="status">
            Practice round — these grades won&apos;t change your schedule.
          </p>
        ) : null}
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
          <div className={styles.face} aria-hidden={flipped}>
            <div className={styles.cardText}>{cleanCardText(card.front)}</div>
            {!flipped ? <p className={styles.hint}>Click to flip</p> : null}
          </div>
          <div
            className={`${styles.face} ${styles.back}`}
            aria-hidden={!flipped}
          >
            <div className={`${styles.cardText} ${styles.backText}`}>
              {cleanCardText(card.back)}
            </div>
          </div>
        </button>
      </div>

      {sourceContext ? (
        <div className={styles.sourceContextContainer}>
          <button
            type="button"
            className={`${styles.sourceContextPill} ${
              sourceDrawerOpen ? styles.sourceContextPillOpen : ""
            }`}
            onClick={() => setSourceDrawerOpen((prev) => !prev)}
            aria-expanded={sourceDrawerOpen}
            aria-controls="source-note-drawer"
            aria-label="Source Note Context"
          >
            <Icon name="file-text" size={14} />
            <span>Source Note Context</span>
            <span className={styles.sourceContextChevron} aria-hidden="true">
              {sourceDrawerOpen ? "▲" : "▼"}
            </span>
          </button>

          {sourceDrawerOpen ? (
            <div
              id="source-note-drawer"
              className={styles.sourceContextDrawer}
              role="region"
              aria-label="Source Note Context"
            >
              <div className={styles.sourceDrawerHeader}>
                <div className={styles.sourceDrawerTitle}>
                  <Icon name="file-text" size={14} />
                  <span>{sourceContext.title || "Linked Study Note"}</span>
                </div>
                <Link
                  to={`/notes/${sourceContext.materialId}`}
                  className={styles.sourceNoteLink}
                  aria-label={`Open source note for ${
                    sourceContext.title || sourceContext.materialId
                  }`}
                >
                  <span>Open Note</span>
                  <Icon name="link" size={14} />
                </Link>
              </div>
              {sourceContext.quote ? (
                <blockquote className={styles.sourceQuote}>
                  <p>{sourceContext.quote}</p>
                </blockquote>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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
        <>
          <div className={styles.socraticTriggerRow}>
            <Button
              variant="secondary"
              className={styles.socraticBtn}
              onClick={() => openSocratic("why_missed")}
            >
              <Icon name="brain" size={16} />
              <span>Why did I miss this? (Socratic Coach)</span>
            </Button>
          </div>
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
        </>
      ) : null}

      <SocraticCoachDrawer
        card={card ?? null}
        isOpen={socraticOpen}
        onClose={() => setSocraticOpen(false)}
        initialMode={socraticMode}
      />
    </div>
  );
}

function getRetentionBadgeClass(label: string): string {
  if (label === "Should stick well") return styles.badgeExcellent;
  if (label === "Should mostly stick") return styles.badgeGood;
  if (label === "Go over it again") return styles.badgeNeedsReview;
  return styles.badgeCritical;
}

function getGradeInfo(quality: number): {
  key: "again" | "hard" | "good" | "easy";
  label: string;
  badgeClass: string;
} {
  if (quality <= 1)
    return { key: "again", label: "Again", badgeClass: styles.gradeBadgeAgain };
  if (quality === 2)
    return { key: "hard", label: "Hard", badgeClass: styles.gradeBadgeHard };
  if (quality === 3)
    return { key: "good", label: "Good", badgeClass: styles.gradeBadgeGood };
  return { key: "easy", label: "Easy", badgeClass: styles.gradeBadgeEasy };
}

type GradeFilter = "all" | "again" | "hard" | "good" | "easy";

function ReviewRecap({
  deckId: _deckId,
  deckTitle,
  folderId,
  results,
  practiceComplete,
  onRepeatDifficult,
}: {
  deckId: string;
  deckTitle: string;
  folderId?: string | null;
  results: ReviewResult[];
  practiceComplete: boolean;
  onRepeatDifficult?: () => void;
}) {
  const navigate = useNavigate();
  const timer = useOptionalTimer();
  const addTask = useAddTask();
  const { showToast } = useToast();
  const [taskAdded, setTaskAdded] = useState(false);
  const recap = recapFrom(results);
  const isDrill = deckTitle === "Daily 5-Minute Drill";
  const [selectedGrade, setSelectedGrade] = useState<GradeFilter>("all");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [socraticCard, setSocraticCard] = useState<Flashcard | null>(null);
  const [socraticMode, setSocraticMode] = useState<SocraticMode>("why_missed");

  const openSocraticForCard = (
    c: Flashcard,
    mode: SocraticMode = "why_missed",
  ) => {
    setSocraticCard(c);
    setSocraticMode(mode);
  };

  const startFocusSession = () => {
    const focusTask =
      recap.weakTopics.length > 0
        ? `Focus: ${recap.weakTopics.slice(0, 2).map((t) => t.topic).join(", ")} (${deckTitle})`
        : `Focus: ${deckTitle}`;
    timer?.prepareFocus(25, focusTask, folderId);
    showToast(`25m Focus session staged for ${deckTitle}!`);
    void navigate("/timer");
  };

  const handleAddRevisionTask = () => {
    if (taskAdded) return;
    const taskName =
      recap.weakTopics.length > 0
        ? `Revise weak topics: ${recap.weakTopics.map((t) => t.topic).join(", ")} (${deckTitle})`
        : `Review cards again: ${deckTitle}`;
    addTask.mutate(
      {
        text: taskName,
        dueDate: dateInDays(1),
      },
      {
        onSuccess: () => {
          setTaskAdded(true);
          showToast("Added revision task for tomorrow!");
        },
        onError: (err) => {
          showToast(`Could not add task: ${err.message}`, { error: true });
        },
      },
    );
  };

  const filteredResults = results.filter(({ card, quality }) => {
    const gradeInfo = getGradeInfo(quality);
    if (selectedGrade !== "all" && gradeInfo.key !== selectedGrade) {
      return false;
    }
    if (selectedTopic) {
      const query = selectedTopic.toLowerCase();
      const frontMatch = card.front.toLowerCase().includes(query);
      const backMatch = card.back.toLowerCase().includes(query);
      if (!frontMatch && !backMatch) return false;
    }
    return true;
  });

  return (
    <div className={styles.view}>
      <ExitLink />
      <section className={styles.recap} aria-labelledby="review-recap-title">
        <p className={styles.eyebrow}>Session recap</p>
        <h2 className={styles.title}>{deckTitle}</h2>
        <h2 id="review-recap-title" className={styles.recapTitle}>
          {isDrill ? "Drill Complete! ⚡" : "Review Complete! 🧠"}
        </h2>

        {practiceComplete ? (
          <p className={styles.practiceComplete} role="status">
            Practice round complete. Your original review schedule was
            preserved.
          </p>
        ) : null}

        {/* How much you’ll remember */}
        <div className={styles.retentionCard}>
          <div className={styles.retentionHeader}>
            <h3 className={styles.retentionTitle}>How much you’ll still remember in a week</h3>
            <span
              className={`${styles.retentionBadge} ${getRetentionBadgeClass(
                recap.retentionLabel,
              )}`}
            >
              {recap.retentionLabel}
            </span>
          </div>
          <div className={styles.retentionScoreRow}>
            <div className={styles.retentionScore}>
              {recap.estimatedRetention}%
            </div>
          </div>
          <div
            className={styles.retentionMeter}
            role="progressbar"
            aria-valuenow={recap.estimatedRetention}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="How much you’ll still remember in a week"
          >
            <div
              className={styles.retentionBar}
              style={{ width: `${recap.estimatedRetention}%` }}
            />
          </div>
          <p className={styles.retentionExplanation}>
            Based on how quickly and how accurately you answered
          </p>
        </div>

        {/* Recall Accuracy */}
        <div className={styles.recallSummary}>
          <strong>{recap.recallPercent}%</strong>
          <span>of cards recalled</span>
        </div>
        <p className={styles.recapMessage}>
          {recap.confident} of {results.length} cards were recalled confidently
          with a Good or Easy grade.
        </p>

        {/* Grade Breakdown Summary Grid */}
        <dl className={styles.scoreGrid} aria-label="Grade breakdown">
          <div className={styles.scoreAgain}>
            <dt>Again</dt>
            <dd aria-label="Again count">{recap.counts.again}</dd>
          </div>
          <div className={styles.scoreHard}>
            <dt>Hard</dt>
            <dd aria-label="Hard count">{recap.counts.hard}</dd>
          </div>
          <div className={styles.scoreGood}>
            <dt>Good</dt>
            <dd aria-label="Good count">{recap.counts.good}</dd>
          </div>
          <div className={styles.scoreEasy}>
            <dt>Easy</dt>
            <dd aria-label="Easy count">{recap.counts.easy}</dd>
          </div>
        </dl>

        {/* Weak Topics Section */}
        {recap.weakTopics.length > 0 ? (
          <div className={styles.weakTopicsSection}>
            <div className={styles.weakTopicsHeader}>
              <h3 className={styles.weakTopicsTitle}>Weak Topics Identified</h3>
              <p className={styles.weakTopicsSubtext}>
                Topics from cards marked Again or Hard. Click a topic to filter
                cards:
              </p>
            </div>
            <div
              className={styles.topicBadges}
              role="list"
              aria-label="Weak topics"
            >
              {recap.weakTopics.map(({ topic, count }) => {
                const isActive = selectedTopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    className={`${styles.topicBadge} ${
                      isActive ? styles.topicBadgeActive : ""
                    }`}
                    onClick={() => setSelectedTopic(isActive ? null : topic)}
                    aria-pressed={isActive}
                  >
                    <span>{topic}</span>
                    <span className={styles.topicCount}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Cards Graded Breakdown */}
        <div className={styles.breakdownSection}>
          <h3 className={styles.breakdownTitle}>Cards Breakdown</h3>
          <div
            className={styles.gradeTabs}
            role="tablist"
            aria-label="Filter cards by grade"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedGrade === "all"}
              className={`${styles.gradeTab} ${
                selectedGrade === "all" ? styles.gradeTabActive : ""
              }`}
              onClick={() => setSelectedGrade("all")}
            >
              All ({results.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGrade === "again"}
              className={`${styles.gradeTab} ${
                selectedGrade === "again" ? styles.gradeTabActive : ""
              }`}
              onClick={() => setSelectedGrade("again")}
            >
              Again ({recap.counts.again})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGrade === "hard"}
              className={`${styles.gradeTab} ${
                selectedGrade === "hard" ? styles.gradeTabActive : ""
              }`}
              onClick={() => setSelectedGrade("hard")}
            >
              Hard ({recap.counts.hard})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGrade === "good"}
              className={`${styles.gradeTab} ${
                selectedGrade === "good" ? styles.gradeTabActive : ""
              }`}
              onClick={() => setSelectedGrade("good")}
            >
              Good ({recap.counts.good})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedGrade === "easy"}
              className={`${styles.gradeTab} ${
                selectedGrade === "easy" ? styles.gradeTabActive : ""
              }`}
              onClick={() => setSelectedGrade("easy")}
            >
              Easy ({recap.counts.easy})
            </button>
          </div>

          <div className={styles.cardBreakdownList}>
            {filteredResults.length === 0 ? (
              <p className={styles.emptyFilterNotice}>
                No cards match the selected filter.
              </p>
            ) : (
              filteredResults.map(({ card, quality }) => {
                const info = getGradeInfo(quality);
                const cardSource = extractSourceNoteContext(card);
                return (
                  <div key={card.id} className={styles.cardBreakdownItem}>
                    <div className={styles.cardBreakdownHeader}>
                      <span
                        className={`${styles.gradeBadge} ${info.badgeClass}`}
                      >
                        {info.label}
                      </span>
                      {cardSource ? (
                        <Link
                          to={`/notes/${cardSource.materialId}`}
                          className={styles.cardBreakdownSourceLink}
                          title={cardSource.title || "Source Note"}
                        >
                          <Icon name="file-text" size={12} />
                          <span>Source Note</span>
                        </Link>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        className={styles.socraticCardBtn}
                        onClick={() =>
                          openSocraticForCard(
                            card,
                            quality < 3 ? "why_missed" : "concept",
                          )
                        }
                      >
                        <Icon name="brain" size={14} />
                        <span>Socratic Coach</span>
                      </Button>
                    </div>
                    <div className={styles.cardFrontPreview}>
                      <span className={styles.cardPreviewLabel}>Q:</span>
                      {cleanCardText(card.front)}
                    </div>
                    <div className={styles.cardBackPreview}>
                      <span className={styles.cardPreviewLabel}>A:</span>
                      {cleanCardText(card.back)}
                    </div>
                    {cardSource?.quote ? (
                      <div className={styles.cardBreakdownQuote}>
                        <span className={styles.cardPreviewLabel}>Quote:</span>
                        <span className={styles.cardQuoteSnippet}>
                          "{cardSource.quote}"
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* What to do next */}
        <div className={styles.nextStepsSection}>
          <h3 className={styles.nextStepsTitle}>What to do next</h3>
          <div className={styles.recapActionsGrid}>
            <Button
              variant="primary"
              onClick={startFocusSession}
              className={styles.recapActionBtn}
            >
              <Icon name="clock" size={16} />
              <span>25 minutes on the tricky ones</span>
            </Button>
            {recap.weakTopics.length > 0 && (
              <Button
                variant="secondary"
                onClick={handleAddRevisionTask}
                disabled={taskAdded || addTask.isPending}
                className={styles.recapActionBtn}
              >
                <Icon name="list-checks" size={16} />
                <span>{taskAdded ? "Added to tomorrow ✓" : "Revise this again tomorrow"}</span>
              </Button>
            )}
            {onRepeatDifficult ? (
              <Button
                variant="secondary"
                onClick={onRepeatDifficult}
                className={styles.recapActionBtn}
              >
                <Icon name="refresh-cw" size={16} />
                <span>Go through the hard ones again</span>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => void navigate(folderId ? `/folders/${folderId}` : "/library/flashcards")}
              className={styles.recapActionBtn}
            >
              <Icon name={folderId ? "folder" : "layers"} size={16} />
              <span>{folderId ? "Back to Subject Hub" : "Back to Flashcards"}</span>
            </Button>
          </div>
          {onRepeatDifficult && (
            <p className={styles.practiceNoticeSmall}>
              Practicing difficult cards is a repeat pass that preserves your scheduled SRS intervals.
            </p>
          )}
          {!onRepeatDifficult && (
            <p className={styles.strongFinish}>
              Strong session — no difficult cards need another pass.
            </p>
          )}
        </div>
      </section>

      <SocraticCoachDrawer
        card={socraticCard}
        isOpen={!!socraticCard}
        onClose={() => setSocraticCard(null)}
        initialMode={socraticMode}
      />
    </div>
  );
}
