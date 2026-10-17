import { Fragment, useEffect, useState } from "react";
import styles from "./home.module.css";

/* Home's question, typed out letter by letter the way someone types it, with
 * a few words standing out in underline or italics. It holds on each line,
 * then erases and types the next, and loops. The heading's accessible name
 * stays the first question, so a screen reader is not read a new line every
 * few seconds, and reduced-motion users get the static heading (with its
 * highlighter stroke), not a timer. */

type Emphasis = "underline" | "italic";
/** A line is a run of plain text and emphasised words. */
type Line = ReadonlyArray<readonly [text: string, emphasis?: Emphasis]>;

const MESSAGES: ReadonlyArray<Line> = [
  [["What do you want to "], ["learn", "underline"], ["?"]],
  [["Tip: Learnora "], ["remembers", "italic"], [" your mistakes."]],
  [["Bring a "], ["topic", "underline"], [", your notes, or a "], ["lecture", "italic"], ["."]],
  [["Every "], ["wrong answer", "underline"], [" becomes your next lesson."]],
  [["Study a little, then "], ["come back", "italic"], [" to it."]],
];

const TYPE_MS = 65;
const ERASE_MS = 30;
const HOLD_MS = 3500;
const PAUSE_MS = 350;

/* Each character of a line with its emphasis, so typing can stop mid-word. */
function charsOf(line: Line): Array<{ c: string; e?: Emphasis }> {
  return line.flatMap(([text, e]) => [...text].map((c) => ({ c, e })));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function TypingHeading({ id }: { id: string }) {
  const [reduce] = useState(prefersReducedMotion);
  const [lineIndex, setLineIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const length = charsOf(MESSAGES[lineIndex]).length;
    let timer: number;
    if (!erasing && shown < length) {
      // A little uneven, so it reads as typing rather than a ticker.
      const jitter = Math.round(Math.random() * 40);
      timer = window.setTimeout(() => setShown((n) => n + 1), TYPE_MS + jitter);
    } else if (!erasing) {
      timer = window.setTimeout(() => setErasing(true), HOLD_MS);
    } else if (shown > 0) {
      timer = window.setTimeout(() => setShown((n) => n - 1), ERASE_MS);
    } else {
      timer = window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % MESSAGES.length);
        setErasing(false);
      }, PAUSE_MS);
    }
    return () => window.clearTimeout(timer);
  }, [reduce, lineIndex, shown, erasing]);

  if (reduce) {
    return (
      <h1 id={id} className={styles.title}>
        What do you want to <span className={styles.marked}>learn</span>?
      </h1>
    );
  }

  // Group the typed characters into runs with the same emphasis.
  const typed = charsOf(MESSAGES[lineIndex]).slice(0, shown);
  const runs: Array<{ text: string; e?: Emphasis }> = [];
  for (const { c, e } of typed) {
    const last = runs[runs.length - 1];
    if (last && last.e === e) last.text += c;
    else runs.push({ text: c, e });
  }

  return (
    <h1 id={id} className={styles.title} aria-label={charsOf(MESSAGES[0]).map((x) => x.c).join("")}>
      <span aria-hidden="true">
        {runs.map((run, i) => (
          <Fragment key={i}>
            {run.e ? (
              <span className={run.e === "italic" ? styles.emItalic : styles.emUnderline}>
                {run.text}
              </span>
            ) : (
              run.text
            )}
          </Fragment>
        ))}
        <span className={styles.caret} />
      </span>
    </h1>
  );
}
