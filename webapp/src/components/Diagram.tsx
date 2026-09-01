import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseDiagramSvg } from "../lib/diagramSvg";
import styles from "./Diagram.module.css";

interface DiagramProps {
  /** Raw `<svg>` source, as the model wrote it. */
  source: string;
  /** Shown under the drawing, and used as its accessible name when the source
   *  carries no `<title>`. */
  caption?: string;
  /** File stem for the download. */
  downloadName?: string;
}

function downloadSvg(source: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([source.trim()], { type: "image/svg+xml" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Renders one model-drawn diagram. Every drop of markup goes through
 *  `parseDiagramSvg` first, so nothing here can script, fetch or navigate.
 *
 *  Deliberately free of app context: a diagram turns up inside a chat bubble,
 *  a notebook artifact, a flashcard answer and the markdown tests, so the
 *  enlarge overlay is a self-contained portal rather than the app's `Modal`
 *  (which requires `OverlayStackProvider` and would make the component
 *  unrenderable anywhere that provider is absent). */
export function Diagram({
  source,
  caption,
  downloadName = "diagram",
}: DiagramProps) {
  const [isEnlarged, setIsEnlarged] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const parse = (className: string) =>
    parseDiagramSvg(source, {
      className,
      ariaLabel: caption ?? "Study diagram",
    });

  const { node, title, error } = useMemo(
    () => parse(styles.svg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, caption],
  );
  const enlarged = useMemo(
    () => (isEnlarged ? parse(styles.enlargedSvg).node : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, caption, isEnlarged],
  );

  useEffect(() => {
    if (!isEnlarged) return;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsEnlarged(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isEnlarged]);

  /* A drawing the sanitiser refused, or that the model wrote badly. The source
     stays on screen rather than being swallowed: a student can still read the
     labels out of it, and a bad generation is visible instead of silent. */
  if (!node) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackMessage}>
          {error ?? "This diagram could not be displayed."}
        </p>
        <pre className={styles.fallbackSource}>{source.trim()}</pre>
      </div>
    );
  }

  const label = caption ?? title;

  return (
    <figure className={styles.figure}>
      {/* A diagram in a chat bubble is only as wide as the bubble, which on a
          split-pane layout is far too narrow to read the labels — so the whole
          drawing opens full-screen on click. */}
      <button
        type="button"
        className={styles.canvas}
        onClick={() => setIsEnlarged(true)}
        aria-label={`Enlarge diagram${label ? `: ${label}` : ""}`}
      >
        {node}
      </button>

      <figcaption className={styles.caption}>
        {label && <span>{label}</span>}
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => setIsEnlarged(true)}
          >
            Enlarge
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => downloadSvg(source, downloadName)}
          >
            Download SVG
          </button>
        </span>
      </figcaption>

      {isEnlarged &&
        createPortal(
          <div
            className={styles.overlay}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsEnlarged(false);
            }}
          >
            <div
              className={styles.overlayPanel}
              role="dialog"
              aria-modal="true"
              aria-label={label ?? "Diagram"}
            >
              <div className={styles.overlayHead}>
                <span className={styles.overlayTitle}>{label}</span>
                <button
                  ref={closeRef}
                  type="button"
                  className={styles.action}
                  onClick={() => setIsEnlarged(false)}
                >
                  Close
                </button>
              </div>
              {enlarged}
            </div>
          </div>,
          document.body,
        )}
    </figure>
  );
}
