import { createContext, useContext, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { getFocusable } from "../hooks/useFocusTrap";

/* Context + hooks for the overlay stack. The provider component lives in
 * OverlayStackProvider.tsx — keeping hooks and components in separate files
 * is what lets Fast Refresh work on both. */

export interface OverlayStackApi {
  register: (onEscape: () => void) => number;
  unregister: (id: number) => void;
}

export const OverlayStackContext = createContext<OverlayStackApi | null>(null);

export function useOverlayStack(): OverlayStackApi {
  const ctx = useContext(OverlayStackContext);
  if (!ctx) {
    throw new Error(
      "useOverlayStack must be used inside <OverlayStackProvider>",
    );
  }
  return ctx;
}

/* Shared open/close behaviour for any overlay: join the stack, move focus in
 * on open, and hand it back to whatever opened the overlay on close — the
 * `entry.trigger?.focus?.()` half of ModalManager.close in js/ui.js. */
export function useOverlayBehavior({
  ref,
  open,
  onClose,
  initialFocusRef,
}: {
  ref: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): void {
  const { register, unregister } = useOverlayStack();

  // Read through refs so a caller passing an inline arrow doesn't re-register
  // the overlay (and re-lock the page) on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRefRef = useRef(initialFocusRef);
  initialFocusRefRef.current = initialFocusRef;

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;
    const id = register(() => onCloseRef.current());

    // The vanilla code defers this to requestAnimationFrame because it focuses
    // a node that was display:none until the class toggle landed. Here the
    // overlay is freshly mounted and already in the DOM when effects run, so
    // focus can move immediately — which also means it still works in a
    // background tab, where rAF never fires.
    const container = ref.current;
    if (container) {
      const preferred = initialFocusRefRef.current?.current;
      if (preferred) {
        preferred.focus();
      } else {
        const [first] = getFocusable(container);
        (first ?? container).focus?.();
      }
    }

    return () => {
      unregister(id);
      trigger?.focus?.();
    };
  }, [open, ref, register, unregister]);
}
