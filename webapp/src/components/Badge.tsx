import type { ComponentPropsWithRef } from "react";
import styles from "./Chip.module.css";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

interface BadgeProps extends ComponentPropsWithRef<"span"> {
  /* Semantic colour. Unlike Chip, a Badge shows its tone at rest by default —
     a status label that only colours on hover communicates nothing. */
  tone?: Tone;
  /* Set false for the quiet neutral pill (counts, source totals) where the
     tone would be noise. */
  soft?: boolean;
  size?: "sm" | "md";
}

/* Badge — the static counterpart to Chip: "Mathematics", "1 source",
 * "Processing", "Hard". A <span>, not a <button>.
 *
 * This is the primitive the app was missing. Chip renders a <button> with a
 * 44px minimum tap target, which is right for a filter toggle and wrong for a
 * label — so every author who needed a status pill wrote their own rather than
 * ship a 44px-tall badge that announces itself as a button. The result was 202
 * pill rules across 38 files while Chip was imported by 3.
 *
 * Both share Chip.module.css: one shape, one tone ramp, one place to change
 * them. */
export function Badge({
  tone = "neutral",
  soft = true,
  size = "md",
  className,
  ...rest
}: BadgeProps) {
  const classes = [
    styles.base,
    styles.badge,
    size === "sm" ? styles.badgeSm : null,
    styles[tone],
    soft ? styles.soft : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes} {...rest} />;
}
