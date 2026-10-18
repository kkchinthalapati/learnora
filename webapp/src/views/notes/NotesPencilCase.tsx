import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type Quill from "quill";
import { Icon } from "../../components/Icon";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { MARK_KINDS, MARK_LABEL, type MarkKind } from "../../lib/noteFormats";
import styles from "./notesPage.module.css";

/* The pencil case under the page (DESIGN.md 0.8): highlighters, the pen's
 * formatting tray, eraser, read aloud, focus and dictation.
 *
 * Every control acts on mousedown with preventDefault, so pressing it never
 * takes focus or the selection away from the page — the reason the Quill
 * toolbar it replaces sometimes needed a second click. Quill keeps the last
 * range it had, so `getSelection(true)` puts the caret back before applying.
 *
 * A highlighter with no words selected is picked up rather than ignored: the
 * next words selected with the mouse are marked with it, until it is put
 * down again (same button, or Escape). */

interface Props {
  quill: Quill | null;
  readOnly: boolean;
  focus: boolean;
  onToggleFocus: () => void;
}

type Formats = Record<string, unknown>;

const keep = (event: MouseEvent) => event.preventDefault();

export function NotesPencilCase({ quill, readOnly, focus, onToggleFocus }: Props) {
  const [armed, setArmed] = useState<MarkKind | null>(null);
  const [formats, setFormats] = useState<Formats>({});
  const [penOpen, setPenOpen] = useState(false);
  const [formula, setFormula] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [hint, setHint] = useState("");
  const armedRef = useRef<MarkKind | null>(null);
  armedRef.current = armed;

  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const speech = useSpeechRecognition({
    continuous: true,
    interimResults: false,
    onFinalTranscript: (text) => {
      const words = text.trim();
      if (!quill || !words) return;
      const range = quill.getSelection(true);
      const before = range.index > 0 ? quill.getText(range.index - 1, 1) : "\n";
      const insert = `${/\s/.test(before) ? "" : " "}${words} `;
      quill.insertText(range.index, insert, "user");
      quill.setSelection(range.index + insert.length, 0, "user");
    },
    onError: (error) => setHint(`Dictation stopped: ${error}`),
  });

  /* The formats under the caret, so the pen's buttons show what is on. */
  useEffect(() => {
    if (!quill) return;
    const refresh = () => {
      const range = quill.getSelection();
      if (range) setFormats(quill.getFormat(range));
    };
    quill.on("selection-change", refresh);
    quill.on("text-change", refresh);
    return () => {
      quill.off("selection-change", refresh);
      quill.off("text-change", refresh);
    };
  }, [quill]);

  /* A picked-up highlighter marks the next mouse selection. Read on pointerup
     rather than selection-change, so a shift+arrow selection is not marked
     one letter at a time. */
  useEffect(() => {
    if (!quill) return;
    const root = quill.root;
    const onUp = () => {
      const kind = armedRef.current;
      if (!kind) return;
      window.setTimeout(() => {
        const range = quill.getSelection();
        if (!range || range.length === 0) return;
        quill.formatText(range.index, range.length, "mark", kind, "user");
        quill.setSelection(range.index + range.length, 0, "user");
      }, 0);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && armedRef.current) {
        setArmed(null);
        setHint("");
      }
    };
    root.addEventListener("pointerup", onUp);
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("keydown", onKey);
    };
  }, [quill]);

  useEffect(() => () => {
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  const selection = useCallback(() => quill?.getSelection(true) ?? null, [quill]);

  const highlight = (kind: MarkKind) => {
    if (!quill) return;
    const range = selection();
    if (range && range.length > 0) {
      const current = quill.getFormat(range).mark;
      quill.formatText(range.index, range.length, "mark", current === kind ? false : kind, "user");
      quill.setSelection(range.index + range.length, 0, "user");
      setHint(current === kind ? `Removed “${MARK_LABEL[kind]}”.` : `Marked “${MARK_LABEL[kind]}”.`);
      return;
    }
    if (armed === kind) {
      setArmed(null);
      setHint("");
    } else {
      setArmed(kind);
      setHint(`Select words to mark them “${MARK_LABEL[kind]}”. Press Escape to put it down.`);
    }
  };

  const toggle = (name: string, value: unknown) => {
    if (!quill) return;
    selection();
    const current = quill.getFormat()[name];
    quill.format(name, current === value ? false : value, "user");
    setFormats(quill.getFormat());
  };

  const erase = () => {
    if (!quill) return;
    const range = selection();
    if (!range || range.length === 0) {
      setHint("Select the words to clear first.");
      return;
    }
    quill.removeFormat(range.index, range.length, "user");
    setHint("Cleared the formatting from the selection.");
  };

  const readAloud = () => {
    if (!quill || !canSpeak) return;
    if (reading) {
      window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const range = quill.getSelection();
    const text = (range && range.length > 0
      ? quill.getText(range.index, range.length)
      : quill.getText()
    ).trim();
    if (!text) {
      setHint("There is nothing on the page to read yet.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setReading(false);
    utterance.onerror = () => setReading(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setReading(true);
    setHint(range && range.length > 0 ? "Reading the selection aloud." : "Reading the page aloud.");
  };

  const dictate = () => {
    if (speech.isListening) {
      speech.stopListening();
      setHint("");
    } else {
      selection();
      speech.startListening();
      setHint("Listening. What you say is typed where the caret is.");
    }
  };

  const insertFormula = () => {
    if (!quill || !formula?.trim()) return;
    const range = selection();
    if (!range) return;
    quill.insertEmbed(range.index, "formula", formula.trim(), "user");
    quill.insertText(range.index + 1, " ", "user");
    quill.setSelection(range.index + 2, 0, "user");
    setFormula(null);
    setPenOpen(false);
  };

  const on = (name: string, value: unknown = true) => formats[name] === value;
  const disabled = readOnly || !quill;

  const penButton = (label: string, icon: ReactNode, name: string, value: unknown = true) => (
    <button
      type="button"
      className={styles.penBtn}
      aria-pressed={on(name, value)}
      aria-label={label}
      title={label}
      onMouseDown={keep}
      onClick={() => {
        toggle(name, value);
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className={styles.caseWrap}>
      {penOpen && !disabled ? (
        <div className={styles.penTray} role="toolbar" aria-label="Pen">
          {penButton("Bold", <b>B</b>, "bold")}
          {penButton("Italic", <i>I</i>, "italic")}
          {penButton("Underline", <u>U</u>, "underline")}
          <span className={styles.penRule} aria-hidden="true" />
          {penButton("Heading", <span className={styles.penSerif}>H</span>, "header", 1)}
          {penButton("Subheading", <span className={styles.penSerifSm}>H</span>, "header", 2)}
          {penButton("Bulleted list", <span>•</span>, "list", "bullet")}
          {penButton("Numbered list", <span>1.</span>, "list", "ordered")}
          {penButton("Checklist", <span>☐</span>, "list", "check")}
          <span className={styles.penRule} aria-hidden="true" />
          {penButton("Subscript", <span>x₂</span>, "script", "sub")}
          {penButton("Superscript", <span>x²</span>, "script", "super")}
          {penButton("Code", <span className={styles.penMono}>{"{}"}</span>, "code-block")}
          <button
            type="button"
            className={styles.penBtn}
            aria-label="Formula"
            title="Formula"
            aria-pressed={formula !== null}
            onMouseDown={keep}
            onClick={() => {
              setFormula((f) => (f === null ? "" : null));
            }}
          >
            <span className={styles.penSerif}>ƒ</span>
          </button>
          {formula !== null ? (
            <span className={styles.formulaRow}>
              <input
                className={styles.formulaInput}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertFormula();
                  }
                  if (e.key === "Escape") setFormula(null);
                }}
                placeholder="E = mc^2"
                aria-label="Formula, in LaTeX"
                autoFocus
              />
              <button type="button" className={styles.formulaGo} onClick={insertFormula}>
                Insert
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.pencilCase} role="toolbar" aria-label="Pencil case">
        <div className={styles.markers} role="group" aria-label="Highlighters">
          {MARK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={styles.marker}
              data-kind={kind}
              data-armed={armed === kind || undefined}
              aria-pressed={armed === kind}
              aria-label={MARK_LABEL[kind]}
              title={MARK_LABEL[kind]}
              disabled={disabled}
              onMouseDown={keep}
              onClick={() => {
                highlight(kind);
              }}
            >
              <span className={styles.markerTip} aria-hidden="true" />
            </button>
          ))}
          <span className={styles.toolLabel} aria-hidden="true">
            {armed ? MARK_LABEL[armed].toLowerCase() : "highlighters"}
          </span>
        </div>
        <button
          type="button"
          className={styles.tool}
          aria-expanded={penOpen}
          disabled={disabled}
          onMouseDown={keep}
          onClick={() => {
            setPenOpen((o) => !o);
            setFormula(null);
          }}
        >
          <Icon name="pencil" size={18} />
          <span className={styles.toolLabel}>pen</span>
        </button>
        <button
          type="button"
          className={styles.tool}
          disabled={disabled}
          onMouseDown={keep}
          onClick={() => {
            erase();
          }}
        >
          <EraserIcon />
          <span className={styles.toolLabel}>eraser</span>
        </button>
        {canSpeak ? (
          <button
            type="button"
            className={styles.tool}
            aria-pressed={reading}
            disabled={!quill}
            onMouseDown={keep}
            onClick={() => {
              readAloud();
            }}
          >
            <Icon name="volume-2" size={18} />
            <span className={styles.toolLabel}>{reading ? "stop" : "read aloud"}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={styles.tool}
          aria-pressed={focus}
          onMouseDown={keep}
          onClick={() => {
            onToggleFocus();
          }}
        >
          <FocusIcon />
          <span className={styles.toolLabel}>focus</span>
        </button>
        {speech.isSupported ? (
          <button
            type="button"
            className={styles.tool}
            aria-pressed={speech.isListening}
            disabled={disabled}
            onMouseDown={keep}
            onClick={() => {
              dictate();
            }}
          >
            <Icon name={speech.isListening ? "mic-off" : "mic"} size={18} />
            <span className={styles.toolLabel}>{speech.isListening ? "stop" : "dictate"}</span>
          </button>
        ) : null}
      </div>
      <p className={styles.caseHint} role="status">
        {hint}
      </p>
    </div>
  );
}

/* Two shapes the shared icon set doesn't have. Drawn here, in its style. */
function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 19.5h11" />
      <path d="M4.6 14.9a1.5 1.5 0 0 1 0-2.1l8.3-8.3a1.5 1.5 0 0 1 2.1 0l4.5 4.5a1.5 1.5 0 0 1 0 2.1l-7.6 7.6a2.5 2.5 0 0 1-1.8.8H8.4a1.5 1.5 0 0 1-1.1-.4Z" />
      <path d="m9.5 9.9 5 5" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
