import styles from "./ProgressRing.module.css";

/* How far along something is (DESIGN.md rule 0.4). The ring is decoration;
 * `label` is what a screen reader hears and should say what is counted —
 * "12 of 30 cards practised", never just "40%". `value` is null when there
 * is nothing to count yet, which draws an empty track rather than a 0 that
 * reads as failure. */

interface ProgressRingProps {
  /** 0..1, or null when there is nothing to measure yet. */
  value: number | null;
  label: string;
  /** Short text inside the ring, e.g. a count. Omit for an empty ring. */
  center?: string;
  size?: "sm" | "md";
}

const DIMENSION = { sm: 32, md: 44 } as const;
const STROKE = { sm: 3, md: 4 } as const;

export function ProgressRing({ value, label, center, size = "md" }: ProgressRingProps) {
  const d = DIMENSION[size];
  const stroke = STROKE[size];
  const r = (d - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = value === null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <span
      className={`${styles.ring} ${size === "sm" ? styles.sm : ""}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true">
        <circle className={styles.track} cx={d / 2} cy={d / 2} r={r} strokeWidth={stroke} />
        {value !== null && clamped > 0 ? (
          <circle
            className={styles.fill}
            cx={d / 2}
            cy={d / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${d / 2} ${d / 2})`}
          />
        ) : null}
      </svg>
      {center ? (
        <span className={styles.center} aria-hidden="true">
          {center}
        </span>
      ) : null}
    </span>
  );
}
