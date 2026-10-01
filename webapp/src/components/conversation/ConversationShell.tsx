/* One chat surface for every AI tool. Solver, Feynman, Viva/Sparring and
 * Exam Detective are *modes* that supply messages and a submit handler; the
 * bubbles, composer, loading and error states are rendered here so the app
 * has one chat shell instead of one per route. Views adopt it piecemeal —
 * `MessageBubble` first (Sparring), then the composer. */

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import styles from "./ConversationShell.module.css";

export type BubbleTone = "student" | "tutor" | "peer" | "system";

export interface MessageBubbleProps {
  tone: BubbleTone;
  /** Emoji or initials; omitted for system lines. */
  avatar?: ReactNode;
  name?: string;
  time?: string;
  children: ReactNode;
  /** Citations, scorecards, actions — rendered under the message text. */
  footer?: ReactNode;
  className?: string;
}

export function MessageBubble({ tone, avatar, name, time, children, footer, className }: MessageBubbleProps) {
  return (
    <div className={`${styles.bubble} ${styles[`tone_${tone}`]} ${className ?? ""}`} data-tone={tone}>
      {avatar !== undefined && <span className={styles.avatar} aria-hidden="true">{avatar}</span>}
      <div className={styles.body}>
        {(name || time) && (
          <div className={styles.header}>
            {name && <span className={styles.name}>{name}</span>}
            {time && <span className={styles.time}>{time}</span>}
          </div>
        )}
        <div className={styles.content}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function TypingIndicator({ label = "Thinking…" }: { label?: string }) {
  return (
    <div className={styles.typing} role="status" aria-live="polite">
      <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  /** Extra controls (mic, skip, hints) rendered beside the send button. */
  children?: ReactNode;
}

export function Composer({ value, onChange, onSubmit, placeholder, disabled, submitLabel = "Send", children }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled && value.trim()) onSubmit();
  };
  return (
    <form className={styles.composer} onSubmit={submit}>
      <textarea
        ref={ref}
        className={styles.textarea}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && value.trim()) onSubmit();
          }
        }}
        aria-label={placeholder ?? "Message"}
      />
      <div className={styles.composerActions}>
        {children}
        <Button type="submit" size="sm" disabled={disabled || !value.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export interface ConversationShellProps {
  /** Rendered `MessageBubble`s (or anything). */
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  composer?: ReactNode;
  className?: string;
}

/** Scroll-pinned message log plus optional composer. */
export function ConversationShell({ children, loading, loadingLabel, error, onRetry, composer, className }: ConversationShellProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  });
  return (
    <div className={`${styles.shell} ${className ?? ""}`}>
      <div
        ref={logRef}
        className={styles.log}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
      >
        {children}
        {loading && <TypingIndicator label={loadingLabel} />}
        {error && <ErrorBanner message={error} onRetry={onRetry} />}
      </div>
      {composer}
    </div>
  );
}
