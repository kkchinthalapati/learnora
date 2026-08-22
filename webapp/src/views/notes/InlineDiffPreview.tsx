import { useEffect } from "react";
import { Icon } from "../../components/Icon";
import type { EditorSelectionRect } from "../../components/RichTextEditor";
import styles from "./notes.module.css";

export const DIFF_PREVIEW_TIMEOUT_MS = 30_000;

interface InlineDiffPreviewProps {
  originalText: string;
  newText: string;
  selectionRect: EditorSelectionRect;
  onAccept: () => void;
  onReject: () => void;
}

export function InlineDiffPreview({
  originalText,
  newText,
  selectionRect,
  onAccept,
  onReject,
}: InlineDiffPreviewProps) {
  useEffect(() => {
    const timer = setTimeout(onReject, DIFF_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onReject]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onReject();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onReject]);

  const viewportWidth = window.innerWidth || 1024;
  const panelWidth = Math.min(520, viewportWidth - 32);
  const center = selectionRect.left + selectionRect.width / 2;
  const left = Math.max(
    panelWidth / 2 + 16,
    Math.min(center, viewportWidth - panelWidth / 2 - 16),
  );
  const placeAbove =
    selectionRect.bottom + 260 > (window.innerHeight || 768) &&
    selectionRect.top > 280;

  return (
    <div
      className={`${styles.inlineDiffPreview} ${
        placeAbove ? styles.inlineDiffPreviewAbove : ""
      }`}
      style={{
        width: panelWidth,
        left,
        top: placeAbove ? selectionRect.top - 10 : selectionRect.bottom + 10,
      }}
      role="dialog"
      aria-label="Review AI edit"
    >
      <div className={styles.diffHeader}>
        <span>Review AI edit</span>
        <span className={styles.diffTimer}>Closes in 30 seconds</span>
      </div>
      <div className={styles.diffOriginal}>
        <span className={styles.diffLabel}>Original</span>
        <p>{originalText}</p>
      </div>
      <div className={styles.diffNew}>
        <span className={styles.diffLabel}>Suggested</span>
        <p>{newText}</p>
      </div>
      <div className={styles.diffActions}>
        <button
          type="button"
          className={styles.diffReject}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReject}
        >
          <Icon name="x" size={15} />
          Reject
        </button>
        <button
          type="button"
          className={styles.diffAccept}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onAccept}
        >
          <Icon name="check" size={15} />
          Accept
        </button>
      </div>
    </div>
  );
}
