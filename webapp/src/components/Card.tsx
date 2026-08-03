import type { ComponentPropsWithRef } from "react";
import styles from "./Card.module.css";

type Variant = "panel" | "elevated" | "row" | "subtle";
type Padding = "none" | "sm" | "md" | "lg";
type Radius = "lg" | "xl";

interface CardProps extends ComponentPropsWithRef<"div"> {
  variant?: Variant;
  padding?: Padding;
  radius?: Radius;
  hoverElevation?: boolean;
}

// "panel" (--r-lg + --shadow-sm) is the app's actual default recipe by a
// factor of four over "elevated" (--r-xl + --shadow-md) — see
// redesign/DESIGN_MOVES.md move #1 for the declaration counts.
const DEFAULT_RADIUS: Record<Variant, Radius> = {
  panel: "lg",
  elevated: "xl",
  row: "lg",
  subtle: "lg",
};

// Renders a single div — no polymorphic `as` prop. DashboardView.test.tsx:528
// climbs `.closest("div")` from an h2 and asserts `getByRole("listitem")`
// (singular); a non-div root would make that climb miss the card and match
// every list on the page. See redesign/PRIMITIVES.md's test-safety table.
export function Card({
  variant = "panel",
  padding = "md",
  radius,
  hoverElevation = false,
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
  return <div className={classes} {...rest} />;
}
