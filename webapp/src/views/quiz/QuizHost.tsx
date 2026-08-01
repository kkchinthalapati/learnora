import { Icon } from "../../components/Icon";
import styles from "./quiz.module.css";

/* The quiz host — ports index.html:920-926 + `showHost`/`hideHost`
 * (js/router.js:846-864).
 *
 * Two changes, both because the vanilla's version was invisible to a screen
 * reader: the bubble is a live region, so a verdict is announced when it
 * appears rather than only being a colour change; and the tone reaches
 * assistive tech as `role="alert"` for a wrong answer versus `"status"`
 * otherwise, matching how `ToastProvider` already splits the two.
 *
 * The vanilla replayed a `pop-in` class by removing it on a 300ms timer. Here
 * the bubble is keyed on its message, so React remounts it and the animation
 * restarts by definition — no timer to leak. */

export type HostTone = "correct" | "incorrect" | null;

export function QuizHost({
  message,
  tone = null,
}: {
  message: string;
  tone?: HostTone;
}) {
  const classes = [
    styles.hostBubble,
    tone === "correct" ? styles.toneCorrect : null,
    tone === "incorrect" ? styles.toneIncorrect : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      key={message}
      className={classes}
      role={tone === "incorrect" ? "alert" : "status"}
    >
      <span className={styles.hostAvatar}>
        <Icon name="brain" size={20} />
      </span>
      <p className={styles.hostMessage}>{message}</p>
    </div>
  );
}
