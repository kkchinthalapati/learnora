import type { ComponentPropsWithRef } from "react";
import styles from "./Card.module.css";

type Variant = "panel" | "elevated" | "row" | "subtle";
type Padding = "none" | "sm" | "md" | "lg";
type Radius = "lg" | "xl";
type As = "div" | "section";

interface CardProps extends ComponentPropsWithRef<"div"> {
  variant?: Variant;
  padding?: Padding;
  radius?: Radius;
  hoverElevation?: boolean;
  // Deliberately narrow, not general polymorphism: "div" (default) or
  // "section" only. DashboardView.test.tsx:528 needs a div root (see below);
  // settings' six `<section aria-labelledby>` cards needed a real landmark
  // element, which forcing them to <div> would have removed. Both are
  // non-interactive containers, so neither risks the button/list-semantics
  // problems that keep other batches' card-shaped elements (a real <button>
  // in notes, a real <li> in tasks) off this primitive entirely.
  as?: As;
}

// "panel" (--r-lg + --shadow-sm) is the app's actual default recipe by a
// factor of four over "elevated" (--r-xl + --shadow-md) — see
// archive/redesign/DESIGN_MOVES.md move #1 for the declaration counts.
const DEFAULT_RADIUS: Record<Variant, Radius> = {
  panel: "lg",
  elevated: "xl",
  row: "lg",
  subtle: "lg",
};

// Default root is a single div — no general polymorphic `as` prop.
// DashboardView.test.tsx:528 climbs `.closest("div")` from an h2 and asserts
// `getByRole("listitem")` (singular); a non-div root there would make that
// climb miss the card and match every list on the page. See
// archive/redesign/PRIMITIVES.md's test-safety table.
export function Card({
  variant = "panel",
  padding = "md",
  radius,
  hoverElevation = false,
  as: As = "div",
  className,
  ...rest
}: CardProps) {
  const resolvedRadius = radius ?? DEFAULT_RADIUS[variant];
  const classes = [
    styles.card,
    styles[variant],
    styles[`padding-${padding}`],
    styles[`radius-${resolvedRadius}`],
    hoverElevation ? styles.hoverElevation : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <As className={classes} {...rest} />;
}
