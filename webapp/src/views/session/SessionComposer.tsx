import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import styles from "./session.module.css";

export interface QuietAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/* The bottom composer every mode shares: a 52px input with mic and send, a
   row of quiet actions, and "Flag this answer" on the right. Enter sends. */
export function SessionComposer({
  placeholder,
  onSend,
  disabled = false,
  busy = false,
  actions = [],
  onFlag,
  voiceDefault = false,
  inputLabel = "Your answer",
}: {
  placeholder: string;
  onSend: (text: string) => void;
  disabled?: boolean;
  busy?: boolean;
  actions?: QuietAction[];
  onFlag?: () => void;
  /** Oral practice: start listening straight away. */
  voiceDefault?: boolean;
  inputLabel?: string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechRecognition({
    silenceTimeoutMs: 4000,
    onFinalTranscript: (text) => {
      if (text.trim()) setValue((v) => (v ? `${v} ${text.trim()}` : text.trim()));
    },
  });
  const { isSupported, startListening } = speech;

  useEffect(() => {
    if (voiceDefault && isSupported) startListening();
    /* Only on arrival: a student who turns the mic off keeps it off. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const text = (value || speech.flushTranscript()).trim();
    if (!text || disabled || busy) return;
    if (speech.isListening) speech.stopListening();
    speech.resetTranscript();
    setValue("");
    onSend(text);
  };

  const shown = speech.isListening && speech.interimTranscript
    ? `${value}${value ? " " : ""}${speech.interimTranscript}`
    : value;

  return (
    <div className={styles.composer}>
      <div className={styles.composerInner}>
        <form
          className={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            value={shown}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-label={inputLabel}
            disabled={disabled}
            autoComplete="off"
          />
          {speech.isSupported ? (
            <button
              type="button"
              className={styles.iconAction}
              aria-pressed={speech.isListening}
              aria-label={speech.isListening ? "Stop voice input" : "Answer by voice"}
              onClick={() =>
                speech.isListening ? speech.stopListening() : speech.startListening()
              }
              disabled={disabled}
            >
              <Icon name={speech.isListening ? "mic-off" : "mic"} size={18} />
            </button>
          ) : null}
          <button
            type="submit"
            className={styles.send}
            aria-label="Send"
            disabled={disabled || busy || !shown.trim()}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
        <div className={styles.quietRow}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={styles.quiet}
              onClick={action.onClick}
              disabled={action.disabled || busy}
            >
              {action.label}
            </button>
          ))}
          {onFlag ? (
            <button
              type="button"
              className={`${styles.quiet} ${styles.flag}`}
              onClick={onFlag}
            >
              Something wrong? Flag this answer
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
