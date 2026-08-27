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
  size?: "md" | "sm";
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.btn,
    styles[variant],
    size === "sm" ? styles.sm : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  // Default to type="button": a bare <button> inside a form submits it, which
  // is almost never what a modal's Cancel or a toolbar action wants.
  return <button type={type} className={classes} {...rest} />;
}
