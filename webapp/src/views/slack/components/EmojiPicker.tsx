import { useEffect, useRef } from "react";
import styles from "../slackWorkspace.module.css";

const QUICK_EMOJIS = ["👍", "❤️", "🔥", "🚀", "💡", "👀", "🎉", "💯"] as const;

export interface EmojiPickerProps {
  isOpen: boolean;
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ isOpen, onSelectEmoji, onClose }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={styles.emojiPickerPopover}
      role="dialog"
      aria-label="Reaction picker"
    >
      <div className={styles.emojiPickerGrid}>
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.emojiPickerButton}
            onClick={() => {
              onSelectEmoji(emoji);
              onClose();
            }}
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
