import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../components/Button";
import {
  TOAST_DEFAULT_DURATION,
  ToastContext,
  type Toast,
  type ToastOptions,
} from "./toast";
import styles from "./ToastProvider.module.css";

/* Port of UI.showToast from js/ui.js. Same defaults (6s), same live-region
 * shape: the container is a polite live region, and each toast carries its own
 * role — "alert" for failures, which interrupt, and "status" for routine
 * confirmations, which wait their turn. */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const duration = options.duration ?? TOAST_DEFAULT_DURATION;
      setToasts((current) => [...current, { ...options, id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), duration),
      );
      return id;
    },
    [dismissToast],
  );

  const notifyFetchError = useCallback(
    (context: string) => {
      showToast(`Couldn't load your ${context}. Check your connection.`, {
        error: true,
      });
    },
    [showToast],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo(
    () => ({ showToast, dismissToast, notifyFetchError }),
    [showToast, dismissToast, notifyFetchError],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className={styles.container}
          role="status"
          aria-live="polite"
          data-testid="toast-container"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`${styles.toast}${toast.error ? ` ${styles.error}` : ""}`}
              role={toast.error ? "alert" : "status"}
            >
              <span>{toast.message}</span>
              {toast.actionLabel && toast.onAction ? (
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.action}
                  onClick={() => {
                    dismissToast(toast.id);
                    toast.onAction?.();
                  }}
                >
                  {toast.actionLabel}
                </Button>
              ) : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
