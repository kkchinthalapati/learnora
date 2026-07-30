import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { useChat } from "../../context/chat";
import { ChatMessageBubble } from "./ChatMessage";
import styles from "./chat.module.css";

/* The workspace chat panel — ports index.html:2314-2455 and its wiring in
 * js/main.js's `bindAI` (:2359-2440).
 *
 * The vanilla registered the panel with `ModalManager`; here it is a plain
 * portal instead, deliberately. `ModalManager`/`OverlayStackProvider` traps
 * focus and locks scroll, which is right for a dialog but wrong for this: the
 * panel is a floating assistant the student is meant to read the page
 * *around*, and the vanilla's own Escape/backdrop behaviour never applied to
 * it either. */

const GREETING =
  "Hi there! I'm Learnora AI. Drop your notes or images here and I'll help you summarize them, or ask me to generate flashcards!";

const SUGGESTIONS = [
  {
    icon: "list-checks",
    label: "What are my tasks?",
    prompt: "What are my pending tasks?",
    autoSend: true,
  },
  {
    icon: "calendar-week",
    label: "Plan my study",
    prompt: "Create a task to study for my next exam",
    autoSend: false,
  },
  {
    icon: "layers",
    label: "Create flashcards",
    prompt: "Generate flashcards from my notes",
    autoSend: false,
  },
  /* Deliberately unsent: this chip used to fire "Start a 25-minute focus
     timer" immediately, so tapping it silently committed the student to 25
     minutes. It drops an unfinished prompt in the box instead. */
  {
    icon: "clock",
    label: "Start a timer",
    prompt: "Start a focus timer for ",
    autoSend: false,
  },
] as const;

interface Position {
  left: number;
  top: number;
}

export function TurboChat() {
  const {
    messages,
    isOpen,
    isFullscreen,
    isSending,
    file,
    draft,
    clearDraft,
    close,
    toggleFullscreen,
    send,
    attachFile,
    clearFile,
  } = useChat();

  const [input, setInput] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  /* A prompt pushed in from outside (a dashboard chip, the command bar). */
  useEffect(() => {
    if (!draft) return;
    setInput(draft);
    clearDraft();
    const el = inputRef.current;
    if (el) {
      el.focus();
      /* Park the caret at the end so a chip that deliberately leaves the
         prompt unfinished ("Start a focus timer for …") can be completed by
         typing straight away. */
      el.setSelectionRange(draft.length, draft.length);
    }
  }, [draft, clearDraft]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  /* Dragging pins the panel with inline left/top. Those survive a window
     resize and leaving fullscreen, either of which can put the header — and
     with it the only close button — outside the viewport, leaving the panel
     impossible to close by clicking (js/ai.js:1530-1548). */
  const clampIntoView = useCallback(() => {
    const panel = panelRef.current;
    setPosition((prev) => {
      if (!prev || !panel) return prev;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      return {
        left: Math.max(0, Math.min(prev.left, maxLeft)),
        top: Math.max(0, Math.min(prev.top, maxTop)),
      };
    });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", clampIntoView);
    return () => window.removeEventListener("resize", clampIntoView);
  }, [clampIntoView]);

  useEffect(() => {
    if (!isFullscreen) clampIntoView();
  }, [isFullscreen, clampIntoView]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel || isFullscreen) return;
    if ((e.target as HTMLElement).closest("button")) return;

    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (move: PointerEvent) => {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      setPosition({
        left: Math.max(0, Math.min(move.clientX - offsetX, maxLeft)),
        top: Math.max(0, Math.min(move.clientY - offsetY, maxTop)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!isOpen) return null;

  const submit = (text: string) => {
    const value = text.trim();
    if (!value && !file) return;
    setInput("");
    void send(value || "Analyze this.");
  };

  const chipClicked = (suggestion: (typeof SUGGESTIONS)[number]) => {
    if (suggestion.autoSend) {
      submit(suggestion.prompt);
      return;
    }
    setInput(suggestion.prompt);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length);
    }
  };

  const panel = (
    <div
      ref={panelRef}
      className={`${styles.panel}${isFullscreen ? ` ${styles.fullscreen}` : ""}`}
      style={
        position && !isFullscreen
          ? {
              left: position.left,
              top: position.top,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      role="region"
      aria-label="Learnora AI chat"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setIsDropTarget(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDropTarget(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setIsDropTarget(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) attachFile(dropped);
      }}
    >
      {isDropTarget ? (
        <div className={styles.dropOverlay}>
          <span>Drop files here</span>
        </div>
      ) : null}

      <div
        className={styles.header}
        onPointerDown={onHeaderPointerDown}
        data-testid="chat-header"
      >
        <h2 className={styles.headerTitle}>
          <Icon name="bot" size={18} />
          Learnora AI
        </h2>
        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={
              isFullscreen ? "Exit full screen" : "Toggle full screen"
            }
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            ⛶
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Close AI chat"
            onClick={close}
          >
            ✖
          </button>
        </div>
      </div>

      <div className={styles.feed} ref={feedRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className={`${styles.bubble} ${styles.aiBubble}`}>
            {GREETING}
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))
        )}
      </div>

      <div className={styles.suggestions}>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            className={styles.chip}
            onClick={() => chipClicked(suggestion)}
          >
            <Icon name={suggestion.icon} size={14} />
            {suggestion.label}
          </button>
        ))}
      </div>

      {file ? (
        <div className={styles.filePill}>
          <span>{file.name}</span>
          <button
            type="button"
            className={styles.removeFile}
            aria-label={`Remove ${file.name}`}
            onClick={clearFile}
          >
            ✖
          </button>
        </div>
      ) : null}

      <form
        className={styles.dock}
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label className={styles.uploadBtn}>
          <Icon name="paperclip" size={20} label="Attach a file" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.png,.jpg,.jpeg"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) attachFile(picked);
              /* Reset so re-picking the same file fires `change` again. */
              e.target.value = "";
            }}
          />
        </label>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          placeholder="Ask AI to do anything... (e.g. 'Start a 25m timer')"
          autoComplete="off"
          aria-label="AI chat input"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          aria-label="Send message"
          disabled={isSending}
        >
          →
        </button>
      </form>
    </div>
  );

  return createPortal(panel, document.body);
}
