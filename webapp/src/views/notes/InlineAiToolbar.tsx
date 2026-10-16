import { useEffect, type ReactNode } from "react";
import type { EditorSelectionRect } from "../../components/RichTextEditor";
import type { InlineAction } from "../../api/aiInlineActions";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import styles from "./notes.module.css";

const ACTIONS: ReadonlyArray<{
  action: Exclude<InlineAction, "custom" | "flashcard" | "make_card">;
  icon: IconName;
  label: string;
}> = [
  { action: "improve", icon: "pencil", label: "Improve" },
  { action: "explain", icon: "message-square", label: "Explain" },
  { action: "summarize", icon: "file-text", label: "Summarise" },
  { action: "expand", icon: "maximize", label: "Expand" },
  { action: "simplify", icon: "minimize", label: "Simplify" },
];

interface InlineAiToolbarProps {
  selectionLength: number;
  selectionRect: EditorSelectionRect;
  loadingAction?: InlineAction | "flashcard" | "make_card" | string | null;
  miniChat?: ReactNode;
  onAction: (action: Exclude<InlineAction, "custom" | "flashcard" | "make_card">) => void;
  onCreateCard?: () => void;
  onAskAi: () => void;
  onDismiss: () => void;
}

export function InlineAiToolbar({
  selectionLength,
  selectionRect,
  loadingAction = null,
  miniChat,
  onAction,
  onCreateCard,
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

  const isCardLoading =
    loadingAction === "flashcard" ||
    loadingAction === "make_card";

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
              <Icon name={icon} size={14} />
            )}
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.inlineToolbarBtn}
          disabled={loadingAction !== null}
          aria-label="Make card selected text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (onCreateCard) {
              onCreateCard();
            }
          }}
        >
          {isCardLoading ? (
            <span
              className={styles.inlineToolbarLoading}
              aria-label="Make card in progress"
            />
          ) : (
            <Icon name="layers" size={14} />
          )}
          <span>Make card</span>
        </button>
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
            <Icon name="help-circle" size={14} />
          )}
          <span>Ask AI</span>
        </button>
      </div>
      {miniChat}
    </div>
  );
}
