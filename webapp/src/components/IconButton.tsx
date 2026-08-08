import type { ComponentPropsWithRef } from "react";
import styles from "./IconButton.module.css";

/* IconButton — the shared 42px glass icon-button shell, extracted per the
 * redesign audit (archive/redesign/DESIGN_MOVES.md move #7). Header's `.iconBtn` is
 * the canonical declaration; a real `<button>`, so this can't be a Card
 * variant (Card is div/section only) — it needed its own primitive. */

type IconButtonProps = ComponentPropsWithRef<"button">;

export function IconButton({
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...rest} />;
}
