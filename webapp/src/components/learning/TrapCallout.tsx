import type { ReactNode } from "react";
import styles from "./learning.module.css";

/* A misconception the student is likely to fall into, named before they do.
   Ochre because it is about memory: the thing you will misremember. */
export function TrapCallout({
  label = "Common trap",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <aside className={styles.trap} aria-label={label}>
      <span className={styles.trapLabel}>{label}</span>
      <span>{children}</span>
    </aside>
  );
}
