import { useId } from "react";
import { Icon } from "../Icon";
import {
  LEARNER_STYLE_OPTIONS,
  type LearnerStyle,
} from "../../lib/learnerStyle";
import styles from "./learnerStylePicker.module.css";

/* "How do you learn best?" as a set of radio cards. Used before the first
   lesson is written (the generation screen) and from a lesson's start
   screen. Choosing is one click; the caller saves it. */
export function LearnerStylePicker({
  value,
  onPick,
  disabled = false,
  compact = false,
}: {
  value: LearnerStyle | null;
  onPick: (style: LearnerStyle) => void;
  disabled?: boolean;
  /** Two columns of short cards instead of full-width rows. */
  compact?: boolean;
}) {
  const name = useId();
  return (
    <div
      className={`${styles.grid} ${compact ? styles.compact : ""}`}
      role="radiogroup"
      aria-label="How you learn best"
    >
      {LEARNER_STYLE_OPTIONS.map((o) => {
        const checked = value === o.id;
        return (
          <label
            key={o.id}
            className={styles.card}
            data-checked={checked || undefined}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={checked}
              disabled={disabled}
              onChange={() => onPick(o.id)}
              className={styles.input}
            />
            <span className={styles.icon} aria-hidden="true">
              <Icon name={o.icon} size={20} />
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{o.label}</span>
              <span className={styles.description}>{o.description}</span>
            </span>
            <span className={styles.tick} aria-hidden="true">
              {checked ? <Icon name="check" size={16} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
