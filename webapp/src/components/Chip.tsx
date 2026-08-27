import type { ComponentPropsWithRef } from "react";
import styles from "./Chip.module.css";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

interface ChipProps extends ComponentPropsWithRef<"button"> {
  /* Semantic colour. Rest state stays quiet regardless; the tone shows on
     hover and (for a toggle) when pressed. */
  tone?: Tone;
  /* Pass a boolean to make this a toggle: it renders `aria-pressed` and
     fills with `tone` when true. Omit for a plain action/status pill. */
  pressed?: boolean;
  /* Status pills (readiness, difficulty) want their tone visible at rest,
     not just on hover — `soft` gives the tinted-background look. Ignored
     while `pressed` (a pressed toggle is always the full fill). */
  soft?: boolean;
  size?: "sm" | "md";
}

/* Chip — the compact pill the views kept re-inventing: filter toggles
 * (`.gapToggleBtn` / `.prereqToggleBtn`), quick-action pills (`.pillBtn` /
 * `.quickBtn`), and status badges that happen to be clickable
 * (`.readinessPillBtn` / `.trophyBtn`). One `<button>`, tokenised, with the
 * pressed/hover/disabled states wired once. */
export function Chip({
  tone = "neutral",
  pressed,
  soft,
  size = "md",
  className,
  type = "button",
  ...rest
}: ChipProps) {
  const classes = [
    styles.chip,
    styles[tone],
    size === "sm" ? styles.sm : null,
    pressed ? styles.pressed : soft ? styles.soft : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      aria-pressed={pressed}
      {...rest}
    />
  );
}
