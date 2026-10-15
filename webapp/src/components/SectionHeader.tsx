import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

/* A heading inside a page, with at most one quiet action (DESIGN.md rule
 * 0.3). `id` lets the section that follows name itself with
 * aria-labelledby. */
export function SectionHeader({
  title,
  id,
  action,
}: {
  title: string;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
