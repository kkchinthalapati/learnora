import { Skeleton } from "../../components/Skeleton";
import { useAiUsage } from "../../hooks/useAiUsage";
import { AI_TOOL_IDS, AI_TOOLS, type QuotaUsage } from "../../lib/entitlements";
import styles from "./settings.module.css";

/* Today's AI allowance, on screen before it runs out — one meter per tool.
 *
 * The limit itself is enforced in the edge function and always has been. What
 * a student never had was any way to see it coming: the first mention of a
 * daily allowance was the generation that got refused, usually mid-task. This
 * is that missing warning, and nothing more — it enforces nothing, and a
 * number here being wrong can only ever mislead, never permit.
 *
 * One row per tool rather than one shared number: quotas moved from a single
 * pool to a cap per tool (chat, notes, flashcards, quiz, plan, and the five
 * differentiator tools), specifically so a flashcard-heavy afternoon cannot
 * silently spend the day's chat budget. A single aggregate meter would hide
 * that and mislead in exactly the direction the old pool did.
 *
 * Renders a skeleton rather than a number while loading. "0 used" and "not
 * known yet" look identical on screen and only one of them is true; showing
 * the wrong one tells a student who is nearly out that they have a full day's
 * budget. */

/** Below this fraction remaining, a tool's meter starts warning. */
const WARN_AT_FRACTION = 0.8;

function ToolMeter({ usage, name }: { usage: QuotaUsage; name: string }) {
  const tone = usage.exceeded
    ? styles.meterFillBad
    : usage.fraction >= WARN_AT_FRACTION
      ? styles.meterFillWarn
      : "";

  return (
    <div className={styles.toolMeterRow}>
      <div className={styles.toolMeterHead}>
        <span className={styles.toolMeterName}>{name}</span>
        <span className={styles.toolMeterCount}>
          {usage.exceeded ? "Used up" : `${usage.remaining} of ${usage.limit} left`}
        </span>
      </div>
      <div
        className={styles.meterTrack}
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
        aria-valuetext={`${usage.used} of ${usage.limit} ${name} generations used today`}
      >
        <div
          className={`${styles.meterFill} ${tone}`}
          style={{ width: `${Math.round(usage.fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function AiUsageMeter({ isPro }: { isPro: boolean }) {
  const { usageFor, resetsAt, isPending, isError } = useAiUsage();

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

  return (
    <div className={`${styles.field} ${styles.fieldStack}`}>
      <div className={styles.fieldLabel}>
        <span className={styles.labelText}>AI generations today, by tool</span>
        <span className={styles.fieldDesc}>
          {isPro
            ? "Each tool has its own daily allowance."
            : "Each tool has its own daily allowance — Plus and Pro raise every one of them."}
          {resetTime ? ` Resets at ${resetTime} your time.` : ""}
        </span>
      </div>

      <div className={styles.toolMeterList}>
        {AI_TOOL_IDS.map((tool) => (
          <ToolMeter key={tool} usage={usageFor(tool)} name={AI_TOOLS[tool].name} />
        ))}
      </div>
    </div>
  );
}
