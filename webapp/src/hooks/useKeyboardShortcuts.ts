import { useEffect, useRef } from "react";

/**
 * Simple keyboard shortcut handler.
 *
 * Maps keys to callbacks. Ignores events when the active element is an
 * input, textarea, or contenteditable node (to avoid hijacking text entry),
 * and ignores any chord that carries a modifier (see below).
 *
 * Key names can be single characters ('a', '1', ' ') or special keys
 * ('Enter', 'Escape', 'ArrowUp', etc.). Comparison is case-insensitive
 * for letter keys.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  /* The map is read through a ref so a caller passing an object literal —
     which every caller does, since the callbacks close over render state —
     doesn't tear down and re-attach the listener on every render. The ref is
     written during render rather than in an effect so the handler never runs
     against a stale closure: a keypress landing between render and effect
     commit would otherwise grade the *previous* card. */
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      /* Never claim a modifier chord. Every shortcut this hook registers is a
         bare key, so a held Ctrl/Cmd/Alt means the keypress belongs to the
         browser or the OS, not to us — and because a match also calls
         preventDefault(), matching one didn't just fire our callback, it
         suppressed the real action. Cmd/Ctrl+D bookmarked nothing and
         silently submitted answer "D" in QuizRunner; Cmd/Ctrl+1-4 switched no
         tab and instead picked an answer or graded a flashcard in ReviewView.
         Shift is not in this list: it is part of ordinary typing and does not
         by itself signal a browser chord. */
      if (e.ctrlKey || e.metaKey || e.altKey) return;

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
      for (const [shortcutKey, callback] of Object.entries(
        shortcutsRef.current,
      )) {
        const normalizedShortcut =
          shortcutKey.length === 1 ? shortcutKey.toLowerCase() : shortcutKey;

        if (key === normalizedShortcut) {
          e.preventDefault();
          callback();
          return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
