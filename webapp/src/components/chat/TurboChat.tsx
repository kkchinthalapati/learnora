import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { useChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { notebooksApi } from "../../api/notebooks";
import { PersonaOffsetToolbar } from "../ai/PersonaOffsetToolbar";
import { ChatMessageBubble } from "./ChatMessage";
import { useSettings } from "../../context/settings";
import { useAiUsage } from "../../hooks/useAiUsage";
import { MAX_IMAGE_DESCRIPTION } from "../../api/aiImage";
import type { SourceMode } from "../ai/PersonaOffsetToolbar";
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
  "Hi! I can explain a topic, quiz you, turn your notes into flashcards, or sort out your tasks and timer. I can get things wrong, so check anything important against your notes.";

const SUGGESTIONS = [
  /* Explaining and quizzing lead: they are what a student opens the panel
     for most, and neither had a starter — the four chips were all admin. */
  {
    icon: "brain",
    label: "Explain something",
    prompt: "Explain ",
    autoSend: false,
  },
  {
    icon: "help-circle",
    label: "Quiz me",
    prompt: "Quiz me on ",
    autoSend: false,
  },
  {
    icon: "list-checks",
    label: "What are my tasks?",
    prompt: "What are my pending tasks?",
    autoSend: true,
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

/* Offered after an answer, not before one.
 *
 * "I still don't get it" is the most common thing a stuck student does
 * next, and it cost a full typed sentence every time — the live pass
 * showed the tutor adapts well when asked, so the only thing standing
 * between a confused student and a better explanation was the typing.
 * These send immediately: each is already a complete instruction, and
 * dropping an unfinished prompt in the box would just be more typing. */
const FOLLOW_UPS = [
  {
    icon: "help-circle",
    label: "Explain simpler",
    prompt: "I still don't get it. Can you explain that more simply?",
  },
  {
    icon: "book-open",
    label: "Give an example",
    prompt: "Can you give me a worked example of that?",
  },
] as const;

interface Position {
  left: number;
}

export function TurboChat() {
  const {
    messages,
    isOpen,
    isFullscreen,
    isSending,
    sendPhase,
    cancel,
    file,
    draft,
    clearDraft,
    close,
    toggleFullscreen,
    send,
    attachFile,
    clearFile,
    saveCards,
    generateImage,
    saveImage,
  } = useChat();
  const { showToast } = useToast();
  const { settings, updateAndSave } = useSettings();
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    settings.webAccess ? "hybrid" : "notebook",
  );

  const handleAddToNotebook = useCallback(
    async (citation: { title: string; url?: string; snippet?: string }) => {
      try {
        const list = await notebooksApi.fetch();
        let targetId = list[0]?.id;
        if (!targetId) {
          const created = await notebooksApi.add({
            title: "Web Research Notebook",
            subject: "General",
            color: "teal",
          });
          targetId = created.id;
        }
        await notebooksApi.addSource(targetId, {
          title: citation.title,
          type: "web",
          url: citation.url,
          content: citation.snippet || citation.url || citation.title,
          selected: true,
        });
        showToast(`Added "${citation.title}" to notebook.`);
      } catch (err) {
        console.error("Failed to add citation to notebook:", err);
        showToast("That source could not be saved. Please try again.", {
          error: true,
        });
      }
    },
    [showToast],
  );

  const [input, setInput] = useState("");
  /* Armed by the "Generate image" chip: the next send draws a diagram
     instead of asking the tutor. Always the student's own click — the model
     has no way to turn it on. */
  const [imageMode, setImageMode] = useState(false);
  const { usageFor, isPending: isUsagePending } = useAiUsage();
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

  /* Dragging pins the panel with an inline `left`. That survives a window
     resize and leaving fullscreen, either of which can push the header — and
     with it the only close button — outside the viewport, leaving the panel
     impossible to close by clicking (js/ai.js:1530-1548).
     Horizontal only: the panel's height is deliberately locked to 100vh (a
     full-height docked surface, like the nav drawer — see chat.module.css),
     so there is never any vertical room to move within and no `top` to
     track. */
  const clampIntoView = useCallback(() => {
    const panel = panelRef.current;
    setPosition((prev) => {
      if (!prev || !panel) return prev;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      return { left: Math.max(0, Math.min(prev.left, maxLeft)) };
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

    const onMove = (move: PointerEvent) => {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      setPosition({
        left: Math.max(0, Math.min(move.clientX - offsetX, maxLeft)),
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
    if (imageMode) {
      if (!value) return;
      setImageMode(false);
      setInput("");
      void generateImage(value);
      return;
    }
    if (!value && !file) return;
    setInput("");
    void send(value || "Analyse this.", { sourceMode });
  };

  const imageUsage = usageFor("image");
  const imageAllowance =
    isUsagePending || imageUsage.unlimited
      ? null
      : imageUsage.exceeded
        ? "No images left today — it resets at midnight UTC."
        : `${imageUsage.remaining} left today`;

  const toggleImageMode = () => {
    setImageMode((on) => !on);
    inputRef.current?.focus();
  };

  const imageChip = (
    <button
      type="button"
      className={`${styles.chip}${imageMode ? ` ${styles.chipActive}` : ""}`}
      aria-pressed={imageMode}
      disabled={isSending}
      onClick={toggleImageMode}
    >
      <Icon name="image" size={14} />
      Generate image
    </button>
  );

  /* Only against a finished answer. Offering "explain simpler" while one
     is still arriving invites a second request the student did not need,
     and offering it on an error would re-ask instead of retrying. */
  const lastMessage = messages[messages.length - 1];
  const showFollowUps =
    lastMessage?.role === "ai" && !lastMessage.pending && !lastMessage.error;

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
              right: "auto",
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
            <Icon name={isFullscreen ? "minimize" : "maximize"} size={16} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Close AI chat"
            onClick={close}
          >
            <Icon name="x" size={16} />
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
            <ChatMessageBubble
              key={message.id}
              message={message}
              onSaveCards={saveCards}
              onSaveImage={saveImage}
              onAddToNotebook={handleAddToNotebook}
              sendPhase={sendPhase}
              onCancel={cancel}
              /* Only the latest failure can be retried: once a retry has
                 been answered, an older "Try again" would ask twice. */
              onRetry={
                message.id === messages[messages.length - 1]?.id
                  ? (m) => {
                      if (!m.retryQuery || isSending) return;
                      if (m.retryAsImage) void generateImage(m.retryQuery);
                      else void send(m.retryQuery, m.retryOptions);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Follow-ups replace the starters once there is something to follow
          up on: the starters are for an empty panel, and showing both
          would put six chips under every answer. */}
      <div className={styles.suggestions}>
        {showFollowUps
          ? FOLLOW_UPS.map((followUp) => (
              <button
                key={followUp.label}
                type="button"
                className={styles.chip}
                disabled={isSending}
                onClick={() => submit(followUp.prompt)}
              >
                <Icon name={followUp.icon} size={14} />
                {followUp.label}
              </button>
            ))
          : SUGGESTIONS.map((suggestion) => (
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
        {/* Offered with both sets: drawing is as useful before a first
            question as after an answer. */}
        {imageChip}
      </div>

      {imageMode ? (
        <div className={styles.imageModeHint} role="status">
          <Icon name="image" size={14} />
          <span>
            <strong>Image mode</strong> — describe a diagram and press send.
            {imageAllowance ? ` ${imageAllowance}` : ""}
          </span>
          <button
            type="button"
            className={styles.imageModeCancel}
            onClick={() => setImageMode(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {file ? (
        <div className={styles.filePill}>
          <span>{file.name}</span>
          <button
            type="button"
            className={styles.removeFile}
            aria-label={`Remove ${file.name}`}
            onClick={clearFile}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : null}

      <div className={styles.toolbarWrapper}>
        <PersonaOffsetToolbar
          depth={settings.aiDepth}
          style={settings.aiStyle}
          sourceMode={sourceMode}
          onDepthChange={(aiDepth) => updateAndSave({ aiDepth })}
          onStyleChange={(aiStyle) => updateAndSave({ aiStyle })}
          onSourceModeChange={(nextMode) => {
            setSourceMode(nextMode);
            updateAndSave({ webAccess: nextMode !== "notebook" });
          }}
        />
      </div>

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
            accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp"
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
          placeholder={
            imageMode
              ? "Describe the diagram, e.g. a labelled plant cell"
              : "Ask AI to do anything... (e.g. 'Start a 25m timer')"
          }
          maxLength={imageMode ? MAX_IMAGE_DESCRIPTION : undefined}
          autoComplete="off"
          aria-label="AI chat input"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          aria-label={imageMode ? "Draw image" : "Send message"}
          /* Also disabled on an empty box. It used to look pressable with
             nothing typed, do nothing at all, and say nothing about why.
             An attachment on its own is enough to send ("Analyse this."). */
          disabled={
            isSending || (input.trim().length === 0 && (imageMode || !file))
          }
        >
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );

  return createPortal(panel, document.body);
}
