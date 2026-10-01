import { HINT_LEVELS, type HintLevel } from "./options";
import styles from "./learning.module.css";

/* Graduated help instead of the answer. A hint-based tutor is what kept
   AI practice from hurting later unaided performance (Bastani et al., PNAS
   2025), so the ladder is always on screen and asking costs nothing. */
export function HintLadder({
  onHint,
  used = [],
  disabled = false,
}: {
  onHint: (level: HintLevel) => void;
  /** Levels already taken this step; they stay usable but read as spent. */
  used?: HintLevel[];
  disabled?: boolean;
}) {
  return (
    <div className={styles.pillRow} role="group" aria-label="Stuck? Ask for a hint">
      <span className={styles.pillRowLabel} aria-hidden="true">
        Stuck?
      </span>
      {HINT_LEVELS.map((level) => (
        <button
          key={level.id}
          type="button"
          className={styles.pill}
          data-used={used.includes(level.id) || undefined}
          disabled={disabled}
          onClick={() => onHint(level.id)}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}
