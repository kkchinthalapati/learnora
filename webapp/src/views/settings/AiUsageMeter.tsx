import { Skeleton } from "../../components/Skeleton";
import { useAiUsage } from "../../hooks/useAiUsage";
import styles from "./settings.module.css";

/* Today's AI allowance, on screen before it runs out.
 *
 * The limit itself is enforced in the edge function and always has been. What
 * a student never had was any way to see it coming: the first mention of a
 * daily allowance was the generation that got refused, usually mid-task. This
 * is that missing warning, and nothing more — it enforces nothing, and a
 * number here being wrong can only ever mislead, never permit.
 *
 * Which is why it renders a skeleton rather than a number while loading. "0
 * used" and "not known yet" look identical on screen and only one of them is
 * true; showing the wrong one tells a student who is nearly out that they have
 * a full day's budget. */

/** Below this fraction remaining, the meter starts warning. Roughly "one
 *  session's worth left" on the free tier — early enough to be a heads-up
 *  rather than an obituary. */
const WARN_AT_FRACTION = 0.8;

export function AiUsageMeter({ isPro }: { isPro: boolean }) {
  const { usage, resetsAt, isPending, isError } = useAiUsage();

  if (isPending) {
    return (
      <div className={`${styles.field} ${styles.fieldStack}`}>
        <Skeleton label="Loading today's AI usage" height={48} />
      </div>
    );
  }

  /* A failed read is said plainly rather than papered over with a zero. The
     allowance still applies — this is the meter failing, not the limit. */
  if (isError) {
    return (
      <div className={`${styles.field} ${styles.fieldStack}`}>
        <div className={styles.fieldLabel}>
          <span className={styles.labelText}>AI generations today</span>
          <span className={styles.fieldDesc}>
            Couldn&rsquo;t read your usage just now. Your daily allowance still
            applies — this is only the counter.
          </span>
        </div>
      </div>
    );
  }

  const resetTime = resetsAt
    ? new Date(resetsAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const tone = usage.exceeded
    ? styles.meterFillBad
    : usage.fraction >= WARN_AT_FRACTION
      ? styles.meterFillWarn
      : "";

  return (
    <div className={`${styles.field} ${styles.fieldStack}`}>
      <div className={styles.fieldLabel}>
        <span className={styles.labelText}>AI generations today</span>
        <span className={styles.fieldDesc}>
          {usage.exceeded
            ? isPro
              ? "You have used today's generations. They reset at midnight."
              : "You have used today's generations. They reset at midnight — or Pro raises the limit."
            : `${usage.remaining} of ${usage.limit} left.`}
          {resetTime ? ` Resets at ${resetTime} your time.` : ""}
        </span>
      </div>

      <div
        className={styles.meterTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
        aria-valuetext={`${usage.used} of ${usage.limit} generations used today`}
      >
        <div
          className={`${styles.meterFill} ${tone}`}
          style={{ width: `${Math.round(usage.fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}
