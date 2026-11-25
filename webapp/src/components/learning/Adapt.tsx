/* Two ways what a student does shapes what Learnora writes (the rules are in
 * lib/learnerSignals.ts). What they *say* about how they learn is "How you
 * learn" (HowYouLearn.tsx), set in onboarding and Settings.
 *  - RateThis: one "helpful / not quite" at the end of a lesson, with a
 *    reason when it missed. Never on every part.
 *  - StyleSuggestion: what their results say about the style they picked,
 *    shown in Settings, never applied for them. */

import { useState } from "react";
import { Icon } from "../Icon";
import { Button } from "../Button";
import { useLearnerSignals } from "../../hooks/useLearnerSignals";
import {
  RATING_REASONS,
  type RatingReason,
  type SignalSurface,
  type StyleSuggestion as Suggestion,
} from "../../lib/learnerSignals";
import { learnerStyleOption, type LearnerStyle } from "../../lib/learnerStyle";
import styles from "./adapt.module.css";

export function RateThis({
  surface,
  refId,
  style,
  topicKey,
}: {
  surface: SignalSurface;
  /** What is being rated, unique to it: one rating per piece of output. */
  refId: string;
  style?: LearnerStyle | null;
  topicKey?: string | null;
}) {
  const { record, available } = useLearnerSignals();
  const [state, setState] = useState<"ask" | "reasons" | "done">("ask");
  const send = (score: 1 | -1, reason: RatingReason | null) => {
    setState("done");
    void record({
      kind: "rating",
      surface,
      score,
      value: reason,
      style: style ?? null,
      topicKey: topicKey ?? null,
      ref: refId,
      clientId: `rate:${refId}`,
    });
  };

  if (!available) return null;
  if (state === "done") {
    return (
      <p className={`${styles.rate} ${styles.rateAsk}`} role="status">
        Thanks. The next lessons will take it into account.
      </p>
    );
  }
  if (state === "reasons") {
    return (
      <div className={styles.rate}>
        <p className={styles.rateAsk} id={`why-${refId}`}>
          What missed?
        </p>
        <div className={styles.chips} role="group" aria-labelledby={`why-${refId}`}>
          {RATING_REASONS.map((r) => (
            <button key={r.id} type="button" className={styles.chip} onClick={() => send(-1, r.id)}>
              {r.label}
            </button>
          ))}
          <button type="button" className={styles.link} onClick={() => setState("ask")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.rate} role="group" aria-label="Did this lesson work for you?">
      <p className={styles.rateAsk}>Did this lesson work for you?</p>
      <button type="button" className={styles.chip} onClick={() => send(1, null)}>
        <Icon name="check" size={14} />
        Helpful
      </button>
      <button type="button" className={styles.chip} onClick={() => setState("reasons")}>
        <Icon name="x" size={14} />
        Not quite
      </button>
    </div>
  );
}

const DISMISS_KEY = "learnora_style_suggestion_dismissed";

function dismissed(style: LearnerStyle): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === style;
  } catch {
    return false;
  }
}

export function StyleSuggestion({
  suggestion,
  onAccept,
  busy = false,
}: {
  suggestion: Suggestion | null;
  onAccept: (style: LearnerStyle) => void;
  busy?: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  if (!suggestion || hidden || dismissed(suggestion.style)) return null;
  const option = learnerStyleOption(suggestion.style);
  return (
    <section className={styles.suggest} aria-label="A suggestion about how you learn">
      <p className={styles.suggestTitle}>
        <Icon name={option.icon} size={18} />
        Try lessons shaped for {option.label.toLowerCase()}?
      </p>
      <p className={styles.note}>{suggestion.reason}</p>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAccept(suggestion.style)}>
          Switch to {option.label.toLowerCase()}
        </Button>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, suggestion.style);
            } catch {
              /* Hidden for this visit either way. */
            }
            setHidden(true);
          }}
        >
          Keep my choice
        </button>
      </div>
    </section>
  );
}
