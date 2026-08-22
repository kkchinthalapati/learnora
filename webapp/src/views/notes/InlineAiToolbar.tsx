import { useEffect, type ReactNode } from "react";
import type { EditorSelectionRect } from "../../components/RichTextEditor";
import type { InlineAction } from "../../api/aiInlineActions";
import styles from "./notes.module.css";

const ACTIONS: ReadonlyArray<{
  action: Exclude<InlineAction, "custom">;
  icon: string;
  label: string;
}> = [
  { action: "improve", icon: "✨", label: "Improve" },
  { action: "explain", icon: "💬", label: "Explain" },
  { action: "summarize", icon: "📝", label: "Summarize" },
  { action: "expand", icon: "🔍", label: "Expand" },
  { action: "simplify", icon: "🔤", label: "Simplify" },
];

interface InlineAiToolbarProps {
  selectionLength: number;
  selectionRect: EditorSelectionRect;
  loadingAction?: InlineAction | null;
  miniChat?: ReactNode;
  onAction: (action: Exclude<InlineAction, "custom">) => void;
  onAskAi: () => void;
  onDismiss: () => void;
}

export function InlineAiToolbar({
  selectionLength,
  selectionRect,
  loadingAction = null,
  miniChat,
  onAction,
  onAskAi,
  onDismiss,
}: InlineAiToolbarProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  if (selectionLength < 10) return null;

  const viewportWidth = window.innerWidth || 1024;
  const halfWidth = Math.min(310, Math.max(140, (viewportWidth - 32) / 2));
  const center = selectionRect.left + selectionRect.width / 2;
  const left = Math.max(
    halfWidth + 16,
    Math.min(center, viewportWidth - halfWidth - 16),
  );
  const placeBelow = selectionRect.top < (miniChat ? 128 : 64);

  return (
    <div
      className={`${styles.inlineToolbarAnchor} ${
        placeBelow ? styles.inlineToolbarBelow : styles.inlineToolbarAbove
      }`}
      style={{
        left,
        top: placeBelow ? selectionRect.bottom + 8 : selectionRect.top - 8,
      }}
      data-placement={placeBelow ? "below" : "above"}
    >
      <div
        className={styles.inlineToolbar}
        role="toolbar"
        aria-label="AI actions for selected text"
      >
        {ACTIONS.map(({ action, icon, label }) => (
          <button
            key={action}
            type="button"
            className={styles.inlineToolbarBtn}
            disabled={loadingAction !== null}
            aria-label={`${label} selected text`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAction(action)}
          >
            {loadingAction === action ? (
              <span
                className={styles.inlineToolbarLoading}
                aria-label={`${label} in progress`}
              />
            ) : (
              <span aria-hidden="true">{icon}</span>
            )}
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.inlineToolbarBtn}
          disabled={loadingAction !== null}
          aria-label="Ask AI about selected text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onAskAi}
        >
          {loadingAction === "custom" ? (
            <span
              className={styles.inlineToolbarLoading}
              aria-label="Custom instruction in progress"
            />
          ) : (
            <span aria-hidden="true">✏️</span>
          )}
          <span>Ask AI</span>
        </button>
      </div>
      {miniChat}
    </div>
  );
}
