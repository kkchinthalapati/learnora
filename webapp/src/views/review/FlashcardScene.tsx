import styles from "./review.module.css";

/* The 3D flip card — ports index.html:958-975 and the `container.onclick`
 * flip in js/router.js (:698-706).
 *
 * Three changes, all because the vanilla drove this by writing
 * `container.style.transform` by hand:
 *
 *  1. **The flip is a class, not an inline transform.** The vanilla read its
 *     own inline style back to decide whether the card was already flipped
 *     (`if (container.style.transform === "rotateY(0deg)" || !…)`), which is
 *     state stored in the DOM. `flipped` is state here and CSS reacts to it —
 *     the same arrangement `style.css`'s own `.card-container.flipped` rule
 *     already used for the (separate) chat-generated card grid.
 *  2. **It is a real `<button>`.** The vanilla put the click handler on a
 *     `<div>`, so the card could not be flipped from the keyboard at all —
 *     the entire review flow was mouse-only.
 *  3. **The face that is turned away is hidden from assistive tech.** With
 *     `backface-visibility` alone both faces stay in the accessibility tree,
 *     so a screen reader read the answer out before the student had flipped
 *     the card.
 */

export function FlashcardScene({
  front,
  back,
  flipped,
  onFlip,
}: {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.scene}${flipped ? ` ${styles.flipped}` : ""}`}
      aria-label={
        flipped ? "Flashcard answer" : "Flashcard question — reveal the answer"
      }
      aria-pressed={flipped}
      onClick={onFlip}
    >
      <span className={styles.card}>
        <span className={styles.face} aria-hidden={flipped}>
          <span className={styles.faceText}>{front}</span>
          {!flipped ? <span className={styles.hint}>Click to flip</span> : null}
        </span>
        <span
          className={`${styles.face} ${styles.faceBack}`}
          aria-hidden={!flipped}
        >
          <span className={styles.faceText}>{back}</span>
        </span>
      </span>
    </button>
  );
}
