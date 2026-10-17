import { useEffect, useRef, useState, type RefObject } from "react";
import type Quill from "quill";
import styles from "./notesPage.module.css";

/* The "/" slip (DESIGN.md 0.8). Typing "/" at the start of a word opens a
 * slip of paper under the caret; typing filters it, arrows and Enter pick,
 * Escape or a space closes it. Picking replaces the "/word" with the block.
 *
 * Its keys are caught on Quill's container in the capture phase, before
 * Quill's own keyboard module sees them, so Enter picks an option rather than
 * splitting the line. The same listener lets Enter on an empty callout line
 * end the callout, the way an empty list item ends a list. */

interface Option {
  label: string;
  keywords: string;
  apply: (quill: Quill, at: number) => void;
}

const line = (name: string, value: unknown) => (quill: Quill, at: number) => {
  quill.formatLine(at, 1, name, value, "user");
};

const OPTIONS: Option[] = [
  { label: "a key idea", keywords: "key idea important", apply: line("callout", "key") },
  { label: "a definition", keywords: "definition define term", apply: line("callout", "def") },
  { label: "a common mistake", keywords: "common mistake wrong error", apply: line("callout", "mistake") },
  { label: "a heading", keywords: "heading title h1", apply: line("header", 1) },
  { label: "a subheading", keywords: "subheading section h2", apply: line("header", 2) },
  { label: "a list", keywords: "list bullet", apply: line("list", "bullet") },
  { label: "a checklist", keywords: "checklist todo tick", apply: line("list", "check") },
  { label: "a quote", keywords: "quote source", apply: line("blockquote", true) },
  { label: "a formula", keywords: "formula equation maths math latex", apply: () => {} },
];

interface ChangeOp {
  retain?: number | Record<string, unknown>;
  insert?: unknown;
  delete?: number;
}

/** The position just after the last edit in a change. */
function caretAfter(ops: ChangeOp[]): number | null {
  let index = 0;
  let caret: number | null = null;
  for (const op of ops) {
    if (typeof op.retain === "number") index += op.retain;
    else if (op.retain) index += 1;
    else if (op.insert !== undefined) {
      index += typeof op.insert === "string" ? op.insert.length : 1;
      caret = index;
    } else if (op.delete) caret = index;
  }
  return caret;
}

interface Open {
  at: number;
  query: string;
  top: number;
  left: number;
}

export function NotesSlashMenu({
  quill,
  pageRef,
  readOnly,
}: {
  quill: Quill | null;
  pageRef: RefObject<HTMLElement | null>;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const [active, setActive] = useState(0);
  const [formula, setFormula] = useState<string | null>(null);
  const openRef = useRef<Open | null>(null);
  /* Set while a pick edits the text, so that edit does not read as the
     student typing past the slip and close it. */
  const pickingRef = useRef(false);
  openRef.current = open;
  const activeRef = useRef(0);
  const formulaRef = useRef<string | null>(null);
  activeRef.current = active;

  formulaRef.current = formula;
  const matches = (q: string) =>
    OPTIONS.filter(
      (o) => !q || `${o.label} ${o.keywords}`.split(" ").some((w) => w.startsWith(q.toLowerCase())),
    );
  const shown = open ? matches(open.query) : [];
  const shownRef = useRef<Option[]>([]);
  shownRef.current = shown;

  const close = () => {
    setOpen(null);
    setFormula(null);
  };

  const pick = (option: Option) => {
    const current = openRef.current;
    if (!quill || !current) return;
    pickingRef.current = true;
    quill.deleteText(current.at, 1 + current.query.length, "user");
    if (option.label === "a formula") {
      quill.setSelection(current.at, 0, "silent");
      pickingRef.current = false;
      setFormula("");
      return;
    }
    option.apply(quill, current.at);
    quill.setSelection(current.at, 0, "user");
    pickingRef.current = false;
    close();
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const insertFormula = () => {
    const current = openRef.current;
    if (!quill || !current || !formula?.trim()) return;
    pickingRef.current = true;
    quill.insertEmbed(current.at, "formula", formula.trim(), "user");
    quill.insertText(current.at + 1, " ", "user");
    quill.setSelection(current.at + 2, 0, "user");
    pickingRef.current = false;
    close();
  };

  useEffect(() => {
    if (!quill || readOnly) return;
    const place = (at: number) => {
      const page = pageRef.current;
      const bounds = quill.getBounds(at);
      if (!page || !bounds) return { top: 0, left: 0 };
      const root = quill.root.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      return {
        top: root.top - box.top + bounds.bottom + 6,
        left: Math.max(0, Math.min(root.left - box.left + bounds.left, box.width - 220)),
      };
    };
    const onText = (delta: { ops: ChangeOp[] }, _o: unknown, source: string) => {
      if (source !== "user" || pickingRef.current) return;
      /* Where the caret ends up, read from the change itself: Quill has not
         moved its stored selection past a just-typed character yet when it
         reports the change. */
      const caret = caretAfter(delta.ops);
      if (caret === null) return;
      const current = openRef.current;
      if (current) {
        const query = quill.getText(current.at + 1, Math.max(0, caret - current.at - 1));
        if (caret <= current.at || quill.getText(current.at, 1) !== "/" || /\s/.test(query) || query.length > 20) {
          close();
        } else {
          setOpen({ ...current, query });
          setActive(0);
        }
        return;
      }
      if (caret < 1 || quill.getText(caret - 1, 1) !== "/") return;
      const before = caret >= 2 ? quill.getText(caret - 2, 1) : "\n";
      if (!/\s/.test(before)) return;
      setOpen({ at: caret - 1, query: "", ...place(caret - 1) });
      setActive(0);
    };
    const onSelection = (range: { index: number } | null) => {
      const current = openRef.current;
      if (pickingRef.current || formulaRef.current !== null) return;
      if (current && (!range || range.index <= current.at)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      const current = openRef.current;
      if (current && shownRef.current.length > 0) {
        const n = shownRef.current.length;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          setActive((i) => (event.key === "ArrowDown" ? (i + 1) % n : (i + n - 1) % n));
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          pickRef.current(shownRef.current[Math.min(activeRef.current, n - 1)]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
      }
      /* Enter on an empty callout line ends the callout. */
      if (event.key === "Enter" && !event.shiftKey) {
        const range = quill.getSelection();
        if (!range) return;
        const formats = quill.getFormat(range);
        const [lineBlot] = quill.getLine(range.index);
        const empty = lineBlot && lineBlot.length() <= 1;
        if (formats.callout && empty) {
          event.preventDefault();
          event.stopPropagation();
          quill.formatLine(range.index, 1, "callout", false, "user");
        }
      }
    };
    const container = quill.container;
    quill.on("text-change", onText);
    quill.on("selection-change", onSelection);
    container.addEventListener("keydown", onKey, true);
    return () => {
      quill.off("text-change", onText);
      quill.off("selection-change", onSelection);
      container.removeEventListener("keydown", onKey, true);
    };
  }, [quill, readOnly, pageRef]);

  if (!open) return null;

  return (
    <div
      className={styles.slip}
      style={{ top: open.top, left: open.left }}
      role="listbox"
      aria-label="Add a block"
    >
      {formula !== null ? (
        <div className={styles.slipFormula}>
          <input
            className={styles.formulaInput}
            value={formula}
            autoFocus
            placeholder="E = mc^2"
            aria-label="Formula, in LaTeX"
            onChange={(e) => setFormula(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertFormula();
              }
              if (e.key === "Escape") {
                close();
                quill?.focus();
              }
            }}
          />
          <button type="button" className={styles.formulaGo} onClick={insertFormula}>
            Insert
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.slipEmpty}>Nothing called that</p>
      ) : (
        shown.map((option, i) => (
          <button
            key={option.label}
            type="button"
            role="option"
            aria-selected={i === active}
            className={styles.slipOption}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              pick(option);
            }}
            onMouseEnter={() => setActive(i)}
          >
            {option.label}
          </button>
        ))
      )}
    </div>
  );
}
