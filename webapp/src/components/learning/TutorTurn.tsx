import type { ReactNode } from "react";
import { TrapCallout } from "./TrapCallout";
import styles from "./learning.module.css";

interface TutorTurnProps {
  /** Mono caps line above the turn: "Step 3 · Explain". */
  meta?: string;
  /** Newsreader claim heading — the one sentence the step is about. */
  claim?: string;
  claimLevel?: 2 | 3;
  /** The explanation. Keep it to about three sentences; a check follows. */
  children?: ReactNode;
  /** Structured block under the prose: a steps grid, a table. */
  structure?: ReactNode;
  trap?: ReactNode;
  /** "Go deeper" disclosure — the longer version, closed by default. */
  deeper?: ReactNode;
  /** The check that ends the turn. */
  check?: ReactNode;
  /** Text is still arriving: show the block cursor after the prose. */
  streaming?: boolean;
}

export function TutorTurn({
  meta,
  claim,
  claimLevel = 3,
  children,
  structure,
  trap,
  deeper,
  check,
  streaming = false,
}: TutorTurnProps) {
  const Heading = claimLevel === 2 ? "h2" : "h3";
  return (
    <article className={styles.tutorTurn} aria-busy={streaming || undefined}>
      {meta ? <p className={styles.meta}>{meta}</p> : null}
      {claim ? <Heading className={styles.claim}>{claim}</Heading> : null}
      {children || streaming ? (
        <div className={styles.prose}>
          {children}
          {streaming ? (
            <span className={styles.cursor} aria-hidden="true" />
          ) : null}
        </div>
      ) : null}
      {structure}
      {trap ? <TrapCallout>{trap}</TrapCallout> : null}
      {deeper ? (
        <details className={styles.deeper}>
          <summary>Go deeper</summary>
          <div className={styles.deeperBody}>{deeper}</div>
        </details>
      ) : null}
      {check}
    </article>
  );
}
