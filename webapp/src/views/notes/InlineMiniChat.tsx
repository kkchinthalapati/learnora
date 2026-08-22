import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import styles from "./notes.module.css";

interface InlineMiniChatProps {
  loading?: boolean;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

export function InlineMiniChat({
  loading = false,
  onSubmit,
  onCancel,
}: InlineMiniChatProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = instruction.trim();
    if (!value || loading) return;
    onSubmit(value);
  };

  return (
    <form className={styles.inlineMiniChat} onSubmit={submit}>
      <input
        ref={inputRef}
        className={styles.inlineMiniChatInput}
        value={instruction}
        disabled={loading}
        placeholder="Tell AI what to change…"
        aria-label="Custom AI instruction"
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="submit"
        className={styles.inlineMiniChatSend}
        disabled={!instruction.trim() || loading}
        aria-label="Run custom AI instruction"
      >
        {loading ? (
          <span className={styles.inlineToolbarLoading} aria-hidden="true" />
        ) : (
          <Icon name="send" size={16} />
        )}
      </button>
      <button
        type="button"
        className={styles.inlineMiniChatClose}
        onClick={onCancel}
        aria-label="Cancel custom AI instruction"
      >
        <Icon name="x" size={15} />
      </button>
    </form>
  );
}
