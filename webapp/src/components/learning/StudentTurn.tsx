import type { ReactNode } from "react";
import styles from "./learning.module.css";

/* The student's own words: ink on paper, inverted, right-aligned. */
export function StudentTurn({ children }: { children: ReactNode }) {
  return (
    <div className={styles.studentTurn}>
      <span className={styles.srOnly}>You said: </span>
      {children}
    </div>
  );
}
