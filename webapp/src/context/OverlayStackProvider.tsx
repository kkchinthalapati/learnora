import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { OverlayStackContext } from "./overlayStack";

/* Port of ModalManager's stack + scroll lock from js/ui.js.
 *
 * Every overlay (Modal and ConfirmDialog alike) registers here while it is
 * open. The provider owns the two things that can't live in an individual
 * overlay: the body scroll lock — which is reference-counted, so nested
 * overlays don't unlock the page when only the inner one closes — and the
 * single document-level Escape listener, which only ever dismisses the
 * top-most entry.
 *
 * The vanilla code special-cased Escape ("ignore it while #app-dialog is
 * open") because dialogs lived outside the modal stack. Here dialogs register
 * on the same stack, so "top-most wins" produces that behaviour without the
 * special case: a dialog opened over a modal is on top, and Escape cancels the
 * dialog only. */

export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const stack = useRef<{ id: number; onEscape: () => void }[]>([]);
  const nextId = useRef(1);

  const syncScrollLock = useCallback(() => {
    document.body.style.overflow = stack.current.length > 0 ? "hidden" : "";
  }, []);

  const register = useCallback(
    (onEscape: () => void) => {
      const id = nextId.current++;
      stack.current.push({ id, onEscape });
      syncScrollLock();
      return id;
    },
    [syncScrollLock],
  );

  const unregister = useCallback(
    (id: number) => {
      stack.current = stack.current.filter((entry) => entry.id !== id);
      syncScrollLock();
    },
    [syncScrollLock],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = stack.current[stack.current.length - 1];
      if (!top) return;
      e.stopPropagation();
      top.onEscape();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, []);

  const api = useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <OverlayStackContext.Provider value={api}>
      {children}
    </OverlayStackContext.Provider>
  );
}
