import styles from "./InlineFeedback.module.css";

/* Ports js/main.js's `showFeedback(id, message, kind)` helper. The vanilla
 * wrote into a permanently-present div and toggled `.show`; here the element
 * only exists while there is something to say.
 *
 * `role` follows the same split as the toast primitive from Step 3: an error
 * is assertive because it blocks the action the user just attempted, a
 * success is polite because it merely confirms one. The vanilla div had no
 * role at all, so neither was announced. */

export type FeedbackKind = "success" | "error";

export interface FeedbackState {
  kind: FeedbackKind;
  message: string;
}

export function InlineFeedback({ kind, message }: FeedbackState) {
  return (
    <div
      className={`${styles.feedback} ${styles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}
