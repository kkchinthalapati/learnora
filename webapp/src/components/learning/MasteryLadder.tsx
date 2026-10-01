import { masteryLabel, RUNG_LABELS, type MasteryRung } from "../../lib/mastery";
import styles from "./learning.module.css";

interface MasteryLadderProps {
  rung: MasteryRung;
  fading?: boolean;
  /** Topic name, shown above the bar and in the accessible name. */
  topic?: string;
  /** Print SEEN / RECALLED / APPLIED / EXPLAINED under the segments. */
  showRungLabels?: boolean;
  size?: "sm" | "md";
  /** The rung the student was on before this check. Segments between it and
   *  `rung` play the fill animation once (reduced motion: they just appear). */
  gainedFrom?: MasteryRung;
}

/* Four equal segments, one per rung, filled up to the rung reached. A fading
   topic paints its top rung ochre. The level is always written out beside the
   bar, so the colour is never the only thing carrying it. */
export function MasteryLadder({
  rung,
  fading = false,
  topic,
  showRungLabels = false,
  size = "md",
  gainedFrom,
}: MasteryLadderProps) {
  const level = masteryLabel({ rung, fading });
  return (
    <div
      className={styles.ladder}
      role="img"
      aria-label={topic ? `${topic}: ${level}` : `Mastery: ${level}`}
    >
      <div className={styles.ladderHead} aria-hidden="true">
        {topic ? <span className={styles.ladderTopic}>{topic}</span> : <span />}
        <span className={styles.ladderLevel}>{level}</span>
      </div>
      <div
        className={`${styles.segments} ${size === "sm" ? styles.segmentsSm : ""}`}
        aria-hidden="true"
      >
        {RUNG_LABELS.map((name, i) => {
          const step = i + 1;
          const state =
            step > rung ? "empty" : fading && step === rung ? "fading" : "filled";
          const gained =
            gainedFrom !== undefined && step > gainedFrom && step <= rung;
          return (
            <span
              key={name}
              className={styles.segment}
              data-state={state}
              data-gained={gained || undefined}
            />
          );
        })}
      </div>
      {showRungLabels ? (
        <div className={`${styles.rungLabels} ${styles.meta}`} aria-hidden="true">
          {RUNG_LABELS.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
