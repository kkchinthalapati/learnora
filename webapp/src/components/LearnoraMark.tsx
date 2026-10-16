/* Learnora's mark: an exercise-book margin and ruled line that together make
 * an "L", with a marker's tick inside it — the page where you put right what
 * you got wrong, which is what the mistakes ledger is. Accent for the page,
 * ochre (--recall) for the tick, so it follows every accent preset.
 * public/learnora-mark.svg is the same drawing with fixed colours, for the
 * favicon and places CSS variables can't reach. */

interface LearnoraMarkProps {
  size?: number;
  className?: string;
  /** Leave unset when a visible "Learnora" sits next to the mark. */
  title?: string;
}

export function LearnoraMark({ size = 28, className, title }: LearnoraMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M20 12V48H46"
        stroke="var(--accent)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30 30.5l5.5 5.5L48 22"
        stroke="var(--recall)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
