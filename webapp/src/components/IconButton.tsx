import type { ComponentPropsWithRef } from "react";
import styles from "./IconButton.module.css";

/* IconButton — the shared 42px glass icon-button shell, extracted per the
 * redesign audit (archive/redesign/DESIGN_MOVES.md move #7). Header's `.iconBtn` is
 * the canonical declaration; a real `<button>`, so this can't be a Card
 * variant (Card is div/section only) — it needed its own primitive. */

interface IconButtonProps extends ComponentPropsWithRef<"button"> {
  /* "ghost": no border or fill until hovered — the TopBar's tools, so help,
     search and the timer read as one row (webapp/DESIGN.md 0.2). */
  variant?: "default" | "ghost";
}

export function IconButton({
  className,
  type = "button",
  variant = "default",
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, variant === "ghost" ? styles.ghost : null, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
