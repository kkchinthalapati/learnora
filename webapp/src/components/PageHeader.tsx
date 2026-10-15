import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

/* The way every page starts (DESIGN.md rule 0.3): a serif title, at most one
 * sentence under it, and actions on the right.
 *
 * `as="h1"` makes it the page's one heading; the route must then be listed
 * in viewOwnsPageTitle() (lib/sectionLabel.ts) so the shell doesn't print a
 * second title above it. Older callers that sit under the shell's own title
 * keep the default, which renders the same look as plain text. `eyebrow` is
 * kept for those callers only — new pages don't use one. */

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "h1" | "p";
}

export function PageHeader({
  title,
  eyebrow,
  sub,
  actions,
  className,
  as: Title = "p",
}: PageHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <div className={styles.text}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <Title className={styles.title}>{title}</Title>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
