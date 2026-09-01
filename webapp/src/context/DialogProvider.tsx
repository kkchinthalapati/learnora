import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../components/Button";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useOverlayBehavior } from "./overlayStack";
import {
  DialogContext,
  type DialogOptions,
  type DialogRequest,
} from "./dialog";
import modalStyles from "../components/Modal.module.css";
import styles from "./DialogProvider.module.css";

/* Replays the empty-submit nudge. The vanilla version forces a reflow to
 * restart a CSS animation; the Web Animations API restarts on every call by
 * definition, with no class-toggling dance and nothing deferred to a frame
 * that a background tab would never run. Optional-called because jsdom
 * doesn't implement animate() — the visible-state assertions live on the
 * .invalid class, which is applied synchronously. */
function shake(el: HTMLElement | null): void {
  if (!el) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el.animate?.(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)", offset: 0.25 },
      { transform: "translateX(5px)", offset: 0.75 },
      { transform: "translateX(0)" },
    ],
    { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}

/* Port of UI._dialog / UI.confirm / UI.promptText from js/ui.js.
 *
 * Same promise contract as the vanilla helpers: confirm resolves true/false,
 * promptText resolves the trimmed string or null. Cancelling — via the Cancel
 * button, Escape, or a click on the backdrop — always resolves rather than
 * rejects, so callers can `await` without a try/catch, exactly as the vanilla
 * call sites do. */

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const confirm = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<boolean>((resolve) => {
        setRequest({
          message,
          isPrompt: false,
          ...options,
          resolve: resolve as DialogRequest["resolve"],
        });
      }),
    [],
  );

  const promptText = useCallback(
    (message: string, options: DialogOptions = {}) =>
      new Promise<string | null>((resolve) => {
        setRequest({
          message,
          isPrompt: true,
          title: options.title ?? "Enter a value",
          confirmText: options.confirmText ?? "Save",
          ...options,
          resolve: resolve as DialogRequest["resolve"],
        });
      }),
    [],
  );

  const api = useMemo(() => ({ confirm, promptText }), [confirm, promptText]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request ? (
        <DialogHost request={request} onSettled={() => setRequest(null)} />
      ) : null}
    </DialogContext.Provider>
  );
}

function DialogHost({
  request,
  onSettled,
}: {
  request: DialogRequest;
  onSettled: () => void;
}) {
  const {
    message,
    isPrompt,
    title = "Are you sure?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false,
    placeholder = "",
    defaultValue = "",
    resolve,
  } = request;

  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [invalid, setInvalid] = useState(false);
  const titleId = useId();
  const messageId = useId();

  const settle = useCallback(
    (result: boolean | string | null) => {
      resolve(result);
      onSettled();
    },
    [resolve, onSettled],
  );

  const cancel = useCallback(
    () => settle(isPrompt ? null : false),
    [settle, isPrompt],
  );

  const submit = useCallback(() => {
    if (!isPrompt) {
      settle(true);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setInvalid(true);
      inputRef.current?.focus();
      shake(inputRef.current);
      return;
    }
    settle(trimmed);
  }, [isPrompt, value, settle]);

  useOverlayBehavior({
    ref: contentRef,
    open: true,
    onClose: cancel,
    initialFocusRef: isPrompt ? inputRef : confirmRef,
  });
  useFocusTrap(contentRef, true);

  /* While the native Fullscreen API has an element fullscreened (e.g. the
     proctored mock exam), only that element's own subtree is composited on
     screen — a portal to document.body mounts outside it and is never
     visible, so a confirm() opened mid-fullscreen (like "End Exam Early")
     would otherwise render a dialog nobody can see or click. Portal into the
     fullscreen element itself when there is one. */
  const portalTarget = document.fullscreenElement ?? document.body;

  return createPortal(
    <div
      className={modalStyles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        ref={contentRef}
        className={modalStyles.content}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Enter submits from the text field, or when the confirm button
          // already has focus — never from Cancel.
          if (isPrompt || document.activeElement === confirmRef.current) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className={modalStyles.head}>
          <h2 id={titleId} className={modalStyles.title}>
            {title}
          </h2>
        </div>
        {message ? (
          <p id={messageId} className={styles.message}>
            {message}
          </p>
        ) : null}
        {isPrompt ? (
          <input
            ref={inputRef}
            className={`${styles.input}${invalid ? ` ${styles.invalid}` : ""}`}
            value={value}
            placeholder={placeholder}
            aria-label={title}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (invalid) setInvalid(false);
            }}
          />
        ) : null}
        <div className={modalStyles.actions}>
          <Button variant="secondary" onClick={cancel}>
            {cancelText}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : "primary"}
            onClick={submit}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
