import { useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import styles from "./RichTextEditor.module.css";

/* Hand-rolled Quill wrapper (archive/REACT_MIGRATION.md Decision #8) rather than
 * `react-quill` — that package is unmaintained against Quill 2.x. Ports
 * js/editor.js's Quill setup and its two documented security fixes
 * (:45-63, :96-106); everything else in that file (autosave scheduling,
 * save-status text) is the notes editor's job, not this primitive's — see
 * views/notes/NotesEditorPane.tsx.
 *
 * Uncontrolled by design: `initialHtml` seeds the document once, on mount.
 * The vanilla's `Editor.init()` is likewise only ever called once per
 * material — there is no "swap the document under a live instance" case to
 * support, so re-rendering with a different `initialHtml` does nothing.
 * Callers that need a different document mount a fresh instance (key the
 * component on whatever identifies the document). */

const TOOLBAR_CONFIG = [
  [{ font: [] }, { size: [] }],
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ header: 1 }, { header: 2 }],
  [{ list: "ordered" }, { list: "bullet" }],
  ["formula", "code-block"],
  ["clean"],
];

/* Explicit allowlist, mirroring what the toolbar above actually offers.
 * Without it Quill keeps its full default format set, which includes
 * `video` — a blot that renders as an <iframe>. Stored HTML containing an
 * iframe survived clipboard.convert() as a video embed, giving a
 * same-origin frame of the app inside a note (clickjacking / spoofed UI).
 * Nothing in this editor needs embeds, so the format is dropped. */
const ALLOWED_FORMATS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "font",
  "size",
  "color",
  "background",
  "script",
  "header",
  "list",
  "indent",
  "align",
  "blockquote",
  "code",
  "code-block",
  "formula",
  "link",
  "image",
];

/* Never assign stored HTML straight to a DOM node. `initialHtml` is
 * attacker-influenced — it round-trips through the DB and is seeded from
 * model output generated off an uploaded document — so assigning it via
 * innerHTML builds whatever DOM it describes. clipboard.convert() parses it
 * into a Delta, keeping only the formats Quill knows about (the allowlist
 * above) and dropping every unknown tag, attribute and handler. */
function setContentsFromHtml(quill: Quill, html: string): void {
  if (!html) {
    quill.setContents([], "silent");
    return;
  }
  const delta = quill.clipboard.convert({ html });
  quill.setContents(delta, "silent");
}

export interface RichTextEditorHandle {
  /** The document as plain text, read live — ports `Editor.getPlainText()`
   *  (js/editor.js:194-197). Its one caller is the notes AI sidebar, which
   *  needs whatever is on screen at the moment a question is sent, unsaved
   *  edits included, rather than the last persisted HTML. Returns "" before
   *  the editor has mounted. */
  getPlainText: () => string;
  /** Appends `text` as a new paragraph at the end of the document. Passed
   *  with Quill's "user" change source, not "api" or "silent" — that's what
   *  makes the existing `text-change` listener fire `onUserChange` exactly
   *  as if the student had typed it themselves, so an AI-inserted paragraph
   *  autosaves through the same debounce path rather than needing a second
   *  one. A no-op before the editor has mounted or while it's read-only. */
  appendText: (text: string) => void;
  getHtml: () => string;
  setHtml: (html: string) => void;
}

export interface RichTextEditorProps {
  initialHtml: string;
  readOnly?: boolean;
  placeholder?: string;
  /** Fires with the editor's current HTML on every user-sourced edit —
   *  never for programmatic ones (the initial load, or a future
   *  `setContents` call), matching Quill's own `source` distinction. */
  onUserChange?: (html: string) => void;
  className?: string;
  ref?: RefObject<RichTextEditorHandle | null>;
}

export function RichTextEditor({
  initialHtml,
  readOnly = false,
  placeholder,
  onUserChange,
  className,
  ref,
}: RichTextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  useImperativeHandle(
    ref,
    () => ({
      getPlainText: () => quillRef.current?.getText() ?? "",
      appendText: (text) => {
        const quill = quillRef.current;
        if (!quill || !text.trim()) return;
        // getLength() counts Quill's own trailing newline, so this is always
        // "just before that" — the true end of the document's content.
        const end = quill.getLength() - 1;
        const hasContent = quill.getText().trim().length > 0;
        quill.insertText(
          end,
          `${hasContent ? "\n\n" : ""}${text.trim()}\n`,
          "user",
        );
        quill.setSelection(quill.getLength() - 1, 0, "silent");
      },
      getHtml: () => quillRef.current?.root.innerHTML ?? "",
      setHtml: (html) => {
        const quill = quillRef.current;
        if (!quill) return;
        quill.clipboard.dangerouslyPasteHTML(html, "api");
      },
    }),
    [],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    /* Quill inserts its toolbar as a sibling immediately *before* whatever
       element it's given, not inside it — so it's handed a plain child <div>
       here rather than the React-managed wrapper itself. That keeps both the
       toolbar and the editor inside one node React owns and tears down
       wholesale on unmount, instead of leaving the toolbar as a stray
       sibling outside anything React is tracking. */
    const target = document.createElement("div");
    wrapper.appendChild(target);

    const quill = new Quill(target, {
      theme: "snow",
      placeholder,
      modules: { toolbar: TOOLBAR_CONFIG },
      formats: ALLOWED_FORMATS,
    });
    quillRef.current = quill;
    setContentsFromHtml(quill, initialHtml);
    quill.enable(!readOnly);

    quill.on("text-change", (_delta, _oldDelta, source) => {
      if (source !== "user") return;
      onUserChangeRef.current?.(quill.root.innerHTML);
    });

    return () => {
      quillRef.current = null;
      wrapper.innerHTML = "";
    };
    // Mount-once by design — see the component comment above.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    quillRef.current?.enable(!readOnly);
  }, [readOnly]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper}${className ? ` ${className}` : ""}`}
      aria-disabled={readOnly || undefined}
    />
  );
}
