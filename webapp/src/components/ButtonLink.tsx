import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

/* A navigation that looks like a Button. Wrapping <Button> in <Link> put a
   <button> inside an <a>: invalid HTML, and two tab stops for one action. */
export function ButtonLink({
  variant = "secondary",
  className,
  ...rest
}: LinkProps & { variant?: "primary" | "secondary" | "ghost" }) {
  const rank =
    variant === "primary"
      ? "primary"
      : variant === "ghost"
        ? "tertiary"
        : "secondary";
  return (
    <Link
      className={[styles.btn, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      data-rank={rank}
      {...rest}
    />
  );
}
