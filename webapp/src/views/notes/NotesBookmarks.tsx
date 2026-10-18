import { useEffect, useState } from "react";
import type Quill from "quill";
import { headingsOf, type NoteHeading } from "../../lib/noteReading";
import styles from "./notesPage.module.css";

/* Ribbon bookmarks down the page's edge: one per heading, kept in step with
 * the document as it is edited. A bookmark scrolls its heading into view and
 * puts the caret at the end of it; the one for the section the caret is in
 * stays raised. Nothing shows until the note has a heading. */

export function NotesBookmarks({ quill }: { quill: Quill | null }) {
  const [headings, setHeadings] = useState<NoteHeading[]>([]);
  const [caret, setCaret] = useState(0);

  useEffect(() => {
    if (!quill) return;
    let timer: number | undefined;
    const read = () => setHeadings(headingsOf(quill.getContents().ops));
    const onText = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 250);
    };
    const onSelection = (range: { index: number } | null) => {
      if (range) setCaret(range.index);
    };
    read();
    quill.on("text-change", onText);
    quill.on("selection-change", onSelection);
    return () => {
      window.clearTimeout(timer);
      quill.off("text-change", onText);
      quill.off("selection-change", onSelection);
    };
  }, [quill]);

  if (!quill || headings.length === 0) return null;

  const current = headings.filter((h) => h.index <= caret).at(-1) ?? headings[0];

  const go = (heading: NoteHeading) => {
    const [line] = quill.getLine(heading.index);
    const node = line?.domNode as HTMLElement | undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    quill.setSelection(heading.index + heading.text.length, 0, "user");
    setCaret(heading.index);
  };

  return (
    <nav className={styles.bookmarks} aria-label="Sections">
      {headings.map((heading) => (
        <button
          key={`${heading.index}-${heading.text}`}
          type="button"
          className={styles.bookmark}
          data-level={heading.level}
          aria-current={heading === current ? "location" : undefined}
          title={heading.text}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            go(heading);
          }}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}
