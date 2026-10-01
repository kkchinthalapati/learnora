import { useEffect, useRef } from "react";

/* Elements that act on Enter/Space themselves. */
const ACTIVATABLE =
  'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';

/**
 * Simple keyboard shortcut handler.
 *
 * Maps keys to callbacks. Ignores events when the active element is an
 * input, textarea, select, or contenteditable node (to avoid hijacking text
 * entry), ignores any chord that carries a modifier, stands down while a
 * modal dialog is open, and leaves Enter/Space to a focused button or link
 * (see below).
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

      /* Ignore events when typing in an input/textarea/select/contenteditable.
         A focused <select> uses letters and digits for type-ahead, so "b"
         jumping to "Biology" also picked answer B behind it. */
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.tagName === "SELECT" ||
        activeElement?.isContentEditable ||
        activeElement?.contentEditable === "true" ||
        activeElement?.getAttribute?.("contenteditable") === "true"
      ) {
        return;
      }

      /* Every caller is a full-page view, so an open modal dialog sits on top
         of it and the keys belong to the dialog. Without this, "b" pressed on
         QuizRunner's "Resume quiz?" prompt answered the hidden question, and
         1-4 in ReviewView's Socratic drawer graded the card behind it. */
      if (document.querySelector('[aria-modal="true"]')) return;

      /* Normalize the key (lowercase for letters) */
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      /* Enter and Space already mean "activate" on a focused button or link.
         Claiming them there cancelled that activation: in QuizRunner a
         keyboard student who tabbed to an answer and pressed Enter got
         nothing, Enter on the Exit link didn't leave, and Enter on "Ask
         why" skipped to the next question instead. A disabled one can't
         activate — the answer just picked keeps focus in some browsers, and
         Enter must still move on from it. */
      if (key === "Enter" || key === " ") {
        const control = activeElement?.closest?.(ACTIVATABLE);
        if (control && !control.matches(":disabled")) return;
      }

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
