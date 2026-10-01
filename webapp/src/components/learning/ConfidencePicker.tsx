import { CONFIDENCE_OPTIONS, type Confidence } from "./options";
import styles from "./learning.module.css";

/* How sure the student was. Optional, and it says so: it exists to separate
   a lucky guess from knowing, and to surface "confident but wrong" — the
   answers that point at a misconception rather than a gap. Pressing the
   selected option again clears it. */
export function ConfidencePicker({
  value,
  onChange,
  label = "How sure are you?",
  disabled = false,
}: {
  value: Confidence | null;
  onChange: (value: Confidence | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className={styles.pillRow} role="group" aria-label={`${label} (optional)`}>
      <span className={styles.pillRowLabel} aria-hidden="true">
        {label} <span className={styles.optional}>Optional</span>
      </span>
      <div className={styles.segmentGroup}>
        {CONFIDENCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.segmentBtn}
            aria-pressed={value === option.id}
            disabled={disabled}
            onClick={() => onChange(value === option.id ? null : option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
