import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { Misconception } from "../../lib/misconceptions";
import {
  MODE_LABELS,
  newSessionHref,
  type SessionMode,
} from "../../lib/sessionModes";
import text from "../../styles/text.module.css";
import styles from "./studyLab.module.css";

interface ModeCard {
  mode: SessionMode;
  prompt: string;
  description: string;
  icon: IconName;
  /** A variant of the same mode, one link below the card. */
  variant?: { label: string; voice?: boolean; preset?: "traps" };
}

/* Start with the problem you have, not the name of a tool. Each card opens a
   Session in one mode; the student can switch mode inside it. */
const MODE_CARDS: ModeCard[] = [
  {
    mode: "explain",
    prompt: "I don't get it yet",
    description:
      "Step by step from the idea underneath, with a quick check after each step.",
    icon: "book-open",
  },
  {
    mode: "socratic",
    prompt: "I want to reason it out",
    description:
      "Questions instead of answers, and hints whenever you're stuck.",
    icon: "help-circle",
    variant: { label: "Oral practice, mic on", voice: true },
  },
  {
    mode: "practice",
    prompt: "I want to solve problems",
    description:
      "Mixed problems, rated for how sure you are, checked one at a time.",
    icon: "target",
    variant: { label: "Exam traps, timed", preset: "traps" },
  },
  {
    mode: "teach",
    prompt: "I think I understand it",
    description:
      "Explain it to someone new. Their questions show what you skipped.",
    icon: "users",
  },
  {
    mode: "recall",
    prompt: "I want to keep it from fading",
    description: "The flashcards that are due, mixed across topics. About ten minutes.",
    icon: "layers",
  },
];

/* Which mode suits a diagnosis. A belief seen once is a hypothesis, so it
   is explained from the root up; one that survived being corrected is an
   explanation the student believes and can't yet defend, which teaching it
   exposes. */
function modeFor(m: Misconception): {
  mode: SessionMode;
  action: "debug_stack" | "teach_apprentice";
  why: string;
} {
  return m.timesObserved > 1
    ? {
        mode: "teach",
        action: "teach_apprentice",
        why: "It has come back after being corrected, so the fastest way through is to try teaching it.",
      }
    : {
        mode: "explain",
        action: "debug_stack",
        why: "Work back from it to the idea underneath.",
      };
}

export function StudyLabView() {
  const navigate = useNavigate();
  const { ranked } = useMisconceptions();
  const [searchParams] = useSearchParams();
  const [topic, setTopic] = useState(searchParams.get("topic")?.trim() || "");
  const activeTopic = topic.trim();

  /* The one row worth interrupting the menu for; absent on a new account. */
  const top = ranked[0];
  const suggested = top ? modeFor(top) : null;

  const startSuggested = () => {
    if (!top || !suggested) return;
    CognitiveBridge.setPayload({
      subject: top.subject,
      topic: top.concept,
      concept: top.concept,
      sourceTool: "notes",
      evidencePrompt: top.summary,
      misconceptions: [top.summary].filter(Boolean),
      severity: top.severity,
      suggestedAction: suggested.action,
    });
    void navigate(
      newSessionHref(suggested.mode, { topic: top.concept, misconception: top.id }),
    );
  };

  const href = (mode: SessionMode, extra: { voice?: boolean; preset?: "traps" } = {}) =>
    newSessionHref(mode, { topic: activeTopic || undefined, ...extra });

  return (
    <div className={styles.view}>
      <header className={styles.hero}>
        <span className={text.meta}>Study</span>
        <h1 className={text.display}>What do you need help with?</h1>
        <label className={styles.topicField}>
          <span className={styles.topicLabel}>What are you working on?</span>
          <input
            className={styles.topicInput}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="A topic, a question you got wrong, a line from your notes"
          />
        </label>
      </header>

      {top && suggested ? (
        <aside className={styles.suggestion} aria-labelledby="lab-suggestion">
          <div>
            <span className={text.meta}>
              Based on your work{top.subject ? ` in ${top.subject}` : ""}
            </span>
            <h2 id="lab-suggestion" className={text.claim}>
              {top.concept}
            </h2>
            <p>
              {top.summary || "This keeps coming up in your work."}{" "}
              {suggested.why}
              {top.timesObserved > 1 ? ` Seen ${top.timesObserved} times so far.` : ""}
            </p>
          </div>
          <button type="button" className={styles.primary} onClick={startSuggested}>
            Start on this
          </button>
        </aside>
      ) : null}

      <section className={styles.modeGrid} aria-label="Choose how to study">
        {MODE_CARDS.map((card) => (
          <div key={card.mode} className={styles.modeCard}>
            <Link to={href(card.mode)} className={styles.modeLink}>
              <span className={styles.icon} aria-hidden="true">
                <Icon name={card.icon} size={20} />
              </span>
              <span className={styles.prompt}>{card.prompt}</span>
              <span className={styles.modeTitle}>{MODE_LABELS[card.mode]}</span>
              <span className={styles.modeText}>{card.description}</span>
            </Link>
            {card.variant ? (
              <Link
                to={href(card.mode, { voice: card.variant.voice, preset: card.variant.preset })}
                className={styles.variant}
              >
                {card.variant.label} →
              </Link>
            ) : null}
          </div>
        ))}
      </section>

      <p className={styles.footnote}>
        Or take a saved quiz from the{" "}
        <Link to="/library/quizzes">Library</Link>.
      </p>
    </div>
  );
}
