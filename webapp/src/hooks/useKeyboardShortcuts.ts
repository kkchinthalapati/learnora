import { useEffect } from "react";

/**
 * Simple keyboard shortcut handler.
 *
 * Maps keys to callbacks. Ignores events when the active element is an
 * input, textarea, or contenteditable node (to avoid hijacking text entry).
 *
 * Key names can be single characters ('a', '1', ' ') or special keys
 * ('Enter', 'Escape', 'ArrowUp', etc.). Comparison is case-insensitive
 * for letter keys.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      /* Ignore events when typing in an input/textarea/contenteditable */
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.isContentEditable ||
        activeElement?.contentEditable === "true" ||
        activeElement?.getAttribute?.("contenteditable") === "true"
      ) {
        return;
      }

      /* Normalize the key (lowercase for letters) */
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      /* Check for a matching shortcut */
      for (const [shortcutKey, callback] of Object.entries(shortcuts)) {
        const normalizedShortcut =
          shortcutKey.length === 1
            ? shortcutKey.toLowerCase()
            : shortcutKey;

        if (key === normalizedShortcut) {
          e.preventDefault();
          callback();
          return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, enabled]);
}
