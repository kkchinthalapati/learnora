import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

/* PageHeader — the shared title+sub+actions row, extracted per the redesign
 * audit (archive/redesign/DESIGN_MOVES.md move #5, archive/redesign/PRIMITIVES.md).
 *
 * Built for the two views the shell's own <h1> can't cover: a subtitle and a
 * right-aligned action slot. Renders `title` as styled text, not a heading —
 * the shell's Header already supplies the page's one <h1> (move #2), so a
 * second one here would recreate the duplicate-heading bug that move fixed. */

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  sub,
  actions,
  className,
}: PageHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <div>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <p className={styles.title}>{title}</p>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
      {actions}
    </div>
  );
}
