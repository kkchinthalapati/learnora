import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOverlayBehavior } from "../context/overlayStack";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Icon } from "./Icon";
import styles from "./Modal.module.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /* Vanilla ModalManager modals only close via their own controls or Escape —
     no overlay-click dismissal — so that stays the default here. */
  closeOnOverlayClick?: boolean;
  closeLabel?: string;
  contentClassName?: string;
  /* Which element gets focus on open, instead of the first focusable node in
     the dialog — which is always the header's Close button, since the head
     renders before `children`. Pass the ref of the field a caller actually
     wants the student typing into first. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeOnOverlayClick = false,
  closeLabel = "Close",
  contentClassName,
  initialFocusRef,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useOverlayBehavior({ ref: contentRef, open, onClose, initialFocusRef });
  useFocusTrap(contentRef, open);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // mousedown, not click: a drag that starts inside the dialog and ends on
      // the backdrop shouldn't count as clicking away.
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={[styles.content, contentClassName].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div className={styles.head}>
          <div>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle ? (
              <p id={subtitleId} className={styles.subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
        {footer ? <div className={styles.actions}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
