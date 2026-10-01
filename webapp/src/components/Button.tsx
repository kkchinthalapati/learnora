import type { ComponentPropsWithRef } from "react";
import styles from "./Button.module.css";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "success";

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
  size?: "md" | "sm" | "lg";
  /* Work in flight. Shows an inline spinner beside the children (pass the
     verb: "Saving"), sets aria-busy and blocks further clicks. */
  busy?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  busy = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.btn,
    styles[variant],
    size === "sm" ? styles.sm : size === "lg" ? styles.lg : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  /* data-rank is the screen's visual hierarchy, expressed so it can be
     asserted: a screen gets one primary. "primary" is the one action the
     screen exists for; "secondary" is a bordered alternative; "tertiary" is
     a text link. The semantic variants (danger/warning/success) carry their
     own weight and are not part of the ranking. */
  const rank =
    variant === "primary"
      ? "primary"
      : variant === "ghost"
        ? "tertiary"
        : variant === "secondary"
          ? "secondary"
          : undefined;

  // Default to type="button": a bare <button> inside a form submits it, which
  // is almost never what a modal's Cancel or a toolbar action wants.
  return (
    <button
      type={type}
      className={classes}
      data-rank={rank}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
